package workflowv3

func NewWorkflowRun() WorkflowRun {
	return WorkflowRun{
		JobRuns: make(map[string][]JobRun),
	}
}

type WorkflowRun struct {
	Number   int64               `json:"number,omitempty" yaml:"number,omitempty"`
	Status   string              `json:"status,omitempty" yaml:"status,omitempty"`
	Workflow Workflow            `json:"workflow,omitempty" yaml:"workflow,omitempty"`
	JobRuns  map[string][]JobRun `json:"job_runs,omitempty" yaml:"job_runs,omitempty"`
}
