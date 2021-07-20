package workflowv3

import (
	"fmt"
	"sort"

	"github.com/ovh/cds/sdk"
	"github.com/ovh/cds/sdk/slug"
)

func ConvertRun(wr *sdk.WorkflowRun, isFullExport bool) WorkflowRun {
	res := NewWorkflowRun()

	res.Workflow = Convert(wr.Workflow, isFullExport)

	for _, execs := range wr.WorkflowNodeRuns {
		for _, exec := range execs {
			node := wr.Workflow.WorkflowData.NodeByID(exec.WorkflowNodeID)
			for _, s := range exec.Stages {
				for _, j := range s.RunJobs {
					jName := slug.Convert(fmt.Sprintf("%s-%s-%s-%d", node.Name, s.Name, j.Job.Action.Name, j.Job.Action.ID))
					if _, ok := res.JobRuns[jName]; !ok {
						res.JobRuns[jName] = nil
					}
					res.JobRuns[jName] = append(res.JobRuns[jName], JobRun{
						Status:    j.Status,
						SubNumber: exec.SubNumber,
					})
				}
			}
		}
	}

	for k := range res.JobRuns {
		sort.Slice(res.JobRuns[k], func(i, j int) bool { return res.JobRuns[k][i].SubNumber > res.JobRuns[k][j].SubNumber })
	}

	return res
}
