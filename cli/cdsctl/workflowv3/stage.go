package workflowv3

import "fmt"

type Stages map[string]Stage

func (s Stages) ExistStage(stageName string) bool {
	_, ok := s[stageName]
	return ok
}

func (s Stages) ToGraph() Graph {
	var res []Node
	for sName, st := range s {
		res = append(res, Node{
			Name:      sName,
			DependsOn: st.DependsOn,
		})
	}
	return res
}

type Stage struct {
	DependsOn  []string   `json:"depends_on,omitempty" yaml:"depends_on,omitempty"`
	Conditions *Condition `json:"conditions,omitempty" yaml:"conditions,omitempty"`
}

func (s Stage) Validate(w Workflow) error {
	// Graph validation
	if len(s.DependsOn) > 0 {
		for _, d := range s.DependsOn {
			if !w.Stages.ExistStage(d) {
				return fmt.Errorf("depends on unknown stage %q", d)
			}
		}
	}

	return nil
}
