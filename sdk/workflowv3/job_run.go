package workflowv3

type JobRun struct {
	Status    string `json:"status,omitempty" yaml:"status,omitempty"`
	SubNumber int64  `json:"sub_number,omitempty" yaml:"sub_number,omitempty"`
}
