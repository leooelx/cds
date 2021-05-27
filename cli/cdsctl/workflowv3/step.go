package workflowv3

import (
	"fmt"
	"strings"

	"github.com/ovh/cds/sdk/exportentities"
)

type Step struct {
	exportentities.StepCustom `json:"-" yaml:",inline"`
	Script                    *StepScript                          `json:"script,omitempty" yaml:"script,omitempty"`
	Coverage                  *exportentities.StepCoverage         `json:"coverage,omitempty" yaml:"coverage,omitempty"`
	ArtifactDownload          *exportentities.StepArtifactDownload `json:"artifactDownload,omitempty" yaml:"artifactDownload,omitempty"`
	ArtifactUpload            *exportentities.StepArtifactUpload   `json:"artifactUpload,omitempty" yaml:"artifactUpload,omitempty"`
	ServeStaticFiles          *exportentities.StepServeStaticFiles `json:"serveStaticFiles,omitempty" yaml:"serveStaticFiles,omitempty"`
	GitClone                  *exportentities.StepGitClone         `json:"gitClone,omitempty" yaml:"gitClone,omitempty"`
	GitTag                    *exportentities.StepGitTag           `json:"gitTag,omitempty" yaml:"gitTag,omitempty"`
	ReleaseVCS                *exportentities.StepReleaseVCS       `json:"releaseVCS,omitempty" yaml:"releaseVCS,omitempty"`
	JUnitReport               *exportentities.StepJUnitReport      `json:"jUnitReport,omitempty" yaml:"jUnitReport,omitempty"`
	Checkout                  *exportentities.StepCheckout         `json:"checkout,omitempty" yaml:"checkout,omitempty"`
	InstallKey                *exportentities.StepInstallKey       `json:"installKey,omitempty" yaml:"installKey,omitempty"`
	Deploy                    *exportentities.StepDeploy           `json:"deploy,omitempty" yaml:"deploy,omitempty"`
}

type StepScript interface{}

func (s Step) Validate(w Workflow) (ExternalDependencies, error) {
	var extDep ExternalDependencies

	// Check action type
	var actionTypes []string
	if s.Script != nil {
		actionTypes = append(actionTypes, "script")
	}
	if s.Deploy != nil {
		actionTypes = append(actionTypes, "deploy")
	}
	if s.ArtifactDownload != nil {
		actionTypes = append(actionTypes, "artifactDownload")
	}
	if s.ArtifactUpload != nil {
		actionTypes = append(actionTypes, "artifactUpload")
	}
	if s.ServeStaticFiles != nil {
		actionTypes = append(actionTypes, "serveStaticFiles")
	}
	if s.JUnitReport != nil {
		actionTypes = append(actionTypes, "jUnitReport")
	}
	if s.GitClone != nil {
		actionTypes = append(actionTypes, "gitClone")
	}
	if s.GitTag != nil {
		actionTypes = append(actionTypes, "gitTag")
	}
	if s.ReleaseVCS != nil {
		actionTypes = append(actionTypes, "releaseVCS")
	}
	if s.Checkout != nil {
		actionTypes = append(actionTypes, "checkout")
	}
	if s.InstallKey != nil {
		actionTypes = append(actionTypes, "installKey")
	}
	if s.Coverage != nil {
		actionTypes = append(actionTypes, "coverage")
	}
	for aName := range s.StepCustom {
		actionTypes = append(actionTypes, aName)
	}
	if len(actionTypes) == 0 {
		return extDep, fmt.Errorf("cannot read action name")
	}
	if len(actionTypes) > 1 {
		return extDep, fmt.Errorf("multiple action defined for the same step %q", actionTypes)
	}

	// Check that custom action exists
	for aName := range s.StepCustom {
		targetAction := strings.TrimPrefix(aName, "@")
		isExternal := targetAction != aName
		if isExternal {
			extDep.Actions = append(extDep.Actions, targetAction)
		} else {
			if !w.Actions.ExistAction(targetAction) {
				return extDep, fmt.Errorf("unknown action %q", targetAction)
			}
		}
	}

	// For deploy action check if deployments exists
	if s.Deploy != nil {
		targetDeployment := strings.TrimPrefix(string(*s.Deploy), "@")
		isExternal := targetDeployment != string(*s.Deploy)
		if isExternal {
			extDep.Deployments = append(extDep.Deployments, targetDeployment)
		} else {
			if !w.Deployments.ExistDeployment(targetDeployment) {
				return extDep, fmt.Errorf("unknown deployment %q", targetDeployment)
			}
		}
	}

	return extDep, nil
}
