package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"

	"gopkg.in/yaml.v2"

	"github.com/ovh/cds/cli"
	"github.com/ovh/cds/cli/cdsctl/workflowv3"
	"github.com/ovh/cds/sdk"
	"github.com/ovh/cds/sdk/cdsclient"
	"github.com/ovh/cds/sdk/exportentities"
	"github.com/ovh/cds/sdk/slug"
)

var workflowV3ConvertCmd = cli.Command{
	Name:  "workflowv3-convert",
	Short: "Convert existing workflow to Workflow V3 files.",
	Ctx: []cli.Arg{
		{Name: _ProjectKey},
		{Name: _WorkflowName},
	},
	Flags: []cli.Flag{
		{
			Name:  "full",
			Type:  cli.FlagBool,
			Usage: "Set the flag to export pipeline, application and environment content.",
		},
		{
			Name:    "format",
			Type:    cli.FlagString,
			Usage:   "Specify export format (json or yaml)",
			Default: "yaml",
		},
	},
}

func workflowV3ConvertRun(v cli.Values) error {
	isFullExport := v.GetBool("full")

	w, err := client.WorkflowGet(v.GetString(_ProjectKey), v.GetString(_WorkflowName), cdsclient.WithDeepPipelines())
	if err != nil {
		return err
	}

	res := workflowv3.NewWorkflow()

	if isFullExport {
		convertApps(res.Variables, res.Secrets, res.Repositories, w)
		convertEnvs(res.Variables, res.Secrets, w)
	}
	convertedNodes := make(map[int64]convertedJobs)
	convertJobs(res.Jobs, res.Deployments, convertedNodes, w, nil, nil, w.WorkflowData.Node, isFullExport)
	sort.Slice(w.WorkflowData.Joins, func(i, j int) bool { return w.WorkflowData.Joins[i].ID < w.WorkflowData.Joins[j].ID })
	for _, j := range w.WorkflowData.Joins {
		var dependsOn []string
		for _, p := range j.JoinContext {
			dependsOn = append(dependsOn, convertedNodes[p.ParentID].endJobNames...)
		}
		convertJobs(res.Jobs, res.Deployments, convertedNodes, w, dependsOn, nil, j, isFullExport)
	}

	format := v.GetString("format")
	var buf []byte
	switch format {
	case "yaml":
		buf, err = yaml.Marshal(res)
	case "json":
		buf, err = json.Marshal(res)
	default:
		return fmt.Errorf("invalid given export format %q", format)
	}
	if err != nil {
		return err
	}
	fmt.Println(string(buf))

	return nil
}

func convertApps(resVars map[string]workflowv3.Variable, resSecrets map[string]workflowv3.Secret, resRepos map[string]workflowv3.Repository, w *sdk.Workflow) {
	for _, a := range w.Applications {
		if a.RepositoryStrategy.ConnectionType != "" {
			resRepos[slug.Convert(a.Name)] = workflowv3.Repository{
				SSHKey:     "@" + a.RepositoryStrategy.SSHKey,
				Connection: a.RepositoryStrategy.ConnectionType,
				Slug:       a.RepositoryFullname,
				Server:     "@" + a.VCSServer,
			}
		}

		variables := make(map[string]interface{})
		for _, va := range a.Variables {
			if va.Type == sdk.SecretVariable {
				resSecrets[slug.Convert(fmt.Sprintf("app-%s-%s", a.Name, va.Name))] = workflowv3.Secret(va.Value)
			} else {
				variables[va.Name] = parseVariableValue(va.Type, va.Value)
			}
		}
		if len(variables) > 0 {
			resVars[slug.Convert("app-"+a.Name)] = variables
		}
	}
}

func convertEnvs(resVars map[string]workflowv3.Variable, resSecrets map[string]workflowv3.Secret, w *sdk.Workflow) {
	for _, e := range w.Environments {
		variables := make(map[string]interface{})
		for _, va := range e.Variables {
			if va.Type == sdk.SecretVariable {
				resSecrets[slug.Convert(fmt.Sprintf("env-%s-%s", e.Name, va.Name))] = workflowv3.Secret(va.Value)
			} else {
				variables[va.Name] = parseVariableValue(va.Type, va.Value)
			}
		}
		if len(variables) > 0 {
			resVars[slug.Convert("env-"+e.Name)] = variables
		}
	}
}

func convertJobs(resJobs map[string]workflowv3.Job, resDeployments map[string]workflowv3.Deployment, convertedNodes map[int64]convertedJobs, w *sdk.Workflow, dependsOn []string, parentNodeCondition *workflowv3.Condition, node sdk.Node, isFullExport bool) {
	if node.Type == sdk.NodeTypeOutGoingHook {
		return
	}

	var currentNodeCondition *workflowv3.Condition
	if isFullExport {
		if node.Context.Conditions.LuaScript != "" || len(node.Context.Conditions.PlainConditions) > 0 {
			currentNodeCondition = &workflowv3.Condition{Lua: node.Context.Conditions.LuaScript}
			for _, c := range node.Context.Conditions.PlainConditions {
				currentNodeCondition.Checks = append(currentNodeCondition.Checks, workflowv3.Check{
					Variable: c.Variable,
					Operator: c.Operator,
					Value:    c.Value,
				})
			}
		}
		if parentNodeCondition != nil {
			if currentNodeCondition != nil {
				currentNodeCondition.Merge(*parentNodeCondition)
			} else {
				currentNodeCondition = parentNodeCondition
			}
		}
	}

	// For Fork, keep condition then explore childs
	if node.Type != sdk.NodeTypePipeline {
		for _, t := range node.Triggers {
			convertJobs(resJobs, resDeployments, convertedNodes, w, dependsOn, currentNodeCondition, t.ChildNode, isFullExport)
		}
		return
	}

	// For Pipeline, create jobs list, add depends on and condition on start jobs
	jobs := computeNodePipelineJobs(w, node.Context.PipelineID, node.Name, isFullExport)
	convertedNodes[node.ID] = jobs
	if len(dependsOn) > 0 {
		for _, sJob := range jobs.startJobs {
			sJob.DependsOn = append(sJob.DependsOn, dependsOn...)
		}
	}
	if currentNodeCondition != nil {
		for _, sJob := range jobs.startJobs {
			if sJob.Conditions == nil {
				sJob.Conditions = &workflowv3.Condition{}
			}
			sJob.Conditions.Merge(*currentNodeCondition)
		}
	}

	for jName, j := range jobs.allJobs {
		if !isFullExport {
			resJobs[jName] = *j
			continue
		}

		// Convert pipeline context to job context
		if node.Context.EnvironmentID > 0 {
			// And env will be converted to variables map
			env := w.Environments[node.Context.EnvironmentID]
			variables, secrets := splitEnvVariablesByType(env.Variables)
			if len(variables) > 0 {
				j.Context = append(j.Context, workflowv3.ContextRaw(fmt.Sprintf("var.env-%s", slug.Convert(node.Context.EnvironmentName))))
			}
			for _, s := range secrets {
				j.Context = append(j.Context, workflowv3.ContextRaw(fmt.Sprintf("secret.env-%s-%s", slug.Convert(node.Context.EnvironmentName), slug.Convert(s.Name))))
			}
		}
		if node.Context.ApplicationID > 0 {
			// An app will divided into repositories, variables maps and deployments
			app := w.Applications[node.Context.ApplicationID]
			if app.RepositoryStrategy.ConnectionType != "" {
				j.Context = append(j.Context, workflowv3.ContextRaw(fmt.Sprintf("repository.%s", slug.Convert(app.Name))))
			}
			variables, secrets := splitAppVariablesByType(app.Variables)
			if len(variables) > 0 {
				j.Context = append(j.Context, workflowv3.ContextRaw(fmt.Sprintf("var.app-%s", slug.Convert(app.Name))))
			}
			for _, s := range secrets {
				j.Context = append(j.Context, workflowv3.ContextRaw(fmt.Sprintf("secret.app-%s-%s", slug.Convert(app.Name), slug.Convert(s.Name))))
			}
			if node.Context.ProjectIntegrationID > 0 && len(app.DeploymentStrategies) > 0 {
				integ := w.ProjectIntegrations[node.Context.ProjectIntegrationID]
				if st, ok := app.DeploymentStrategies[integ.Name]; ok {
					vars := make(map[string]workflowv3.DeploymentConfigValue, len(st))
					for k, v := range st {
						vars[k] = workflowv3.DeploymentConfigValue{
							Type:  v.Type,
							Value: v.Value,
						}
					}

					deploymentName := slug.Convert(fmt.Sprintf("%s-%s", app.Name, integ.Name))
					resDeployments[deploymentName] = workflowv3.Deployment{
						Integration: "@" + integ.Name,
						Config:      vars,
					}

					// Set deployment info on step action
					for i := range j.Steps {
						if j.Steps[i].Deploy != nil {
							d := exportentities.StepDeploy(deploymentName)
							j.Steps[i].Deploy = &d
						}
					}
				}
			}
		}

		resJobs[jName] = *j
	}

	for _, t := range node.Triggers {
		convertJobs(resJobs, resDeployments, convertedNodes, w, jobs.endJobNames, nil, t.ChildNode, isFullExport)
	}
}

type convertedJobs struct {
	allJobs     map[string]*workflowv3.Job
	startJobs   []*workflowv3.Job
	endJobNames []string
}

func computeNodePipelineJobs(w *sdk.Workflow, pipelineID int64, nodeName string, isFullExport bool) convertedJobs {
	pip := w.Pipelines[pipelineID]

	res := convertedJobs{
		allJobs: make(map[string]*workflowv3.Job),
	}

	var previousStagesJobNames []string
	for i, s := range pip.Stages {
		isFirstStage := i == 0
		isLastStage := i == len(pip.Stages)-1

		var stageJobNames []string
		for _, j := range s.Jobs {
			jName := slug.Convert(fmt.Sprintf("%s-%s-%s-%d", nodeName, s.Name, j.Action.Name, j.Action.ID))
			stageJobNames = append(stageJobNames, jName)
			newJob := workflowv3.ConvertJob(j, isFullExport)
			if len(previousStagesJobNames) > 0 {
				newJob.DependsOn = append(newJob.DependsOn, previousStagesJobNames...)
			}
			res.allJobs[jName] = &newJob
			if isFirstStage {
				res.startJobs = append(res.startJobs, &newJob)
			}
			if isLastStage {
				res.endJobNames = append(res.endJobNames, jName)
			}
		}

		previousStagesJobNames = stageJobNames
	}

	return res
}

func splitAppVariablesByType(vs []sdk.ApplicationVariable) (variables, secrets []sdk.ApplicationVariable) {
	for i := range vs {
		if vs[i].Type == sdk.SecretVariable {
			secrets = append(secrets, vs[i])
		} else {
			variables = append(variables, vs[i])
		}
	}
	return
}

func splitEnvVariablesByType(vs []sdk.EnvironmentVariable) (variables, secrets []sdk.EnvironmentVariable) {
	for i := range vs {
		if vs[i].Type == sdk.SecretVariable {
			secrets = append(secrets, vs[i])
		} else {
			variables = append(variables, vs[i])
		}
	}
	return
}

func parseVariableValue(vType, vValue string) interface{} {
	switch vType {
	case sdk.NumberVariable:
		v, _ := strconv.ParseFloat(vValue, 64)
		return v
	case sdk.BooleanParameter:
		v, _ := strconv.ParseBool(vValue)
		return v
	}
	return vValue
}
