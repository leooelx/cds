package workflowv3

type Variables map[string]Variable

func (v Variables) ExistVariable(variableName string) bool {
	_, ok := v[variableName]
	return ok
}

type Variable interface{}
