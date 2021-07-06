package api

import (
	"context"
	"io/ioutil"
	"net/http"

	"github.com/ovh/cds/cli/cdsctl/workflowv3"
	"github.com/ovh/cds/engine/service"
	"github.com/ovh/cds/sdk"
	"github.com/ovh/cds/sdk/exportentities"
)

func (api *API) postWorkflowV3Validate() service.Handler {
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request) error {
		body, err := ioutil.ReadAll(r.Body)
		if err != nil {
			return sdk.NewError(sdk.ErrWrongRequest, err)
		}
		defer r.Body.Close()

		res := struct {
			Valid                bool                            `json:"valid,omitempty"`
			Error                string                          `json:"error,omitempty"`
			Workflow             workflowv3.Workflow             `json:"workflow,omitempty"`
			ExternalDependencies workflowv3.ExternalDependencies `json:"external_dependencies,omitempty"`
		}{}

		contentType := r.Header.Get("Content-Type")
		if contentType == "" {
			contentType = http.DetectContentType(body)
		}
		format, err := exportentities.GetFormatFromContentType(contentType)
		if err != nil {
			res.Error = sdk.ExtractHTTPError(err).Error()
			return service.WriteJSON(w, res, http.StatusOK)
		}

		var workflow workflowv3.Workflow
		if err := exportentities.Unmarshal(body, format, &workflow); err != nil {
			res.Error = sdk.ExtractHTTPError(sdk.NewErrorFrom(sdk.ErrWrongRequest, "invalid workflow v3 format: %v", err)).Error()
			return service.WriteJSON(w, res, http.StatusOK)
		}

		res.Workflow = workflow

		// Static validation for workflow
		extDep, err := workflow.Validate()

		res.Valid = err == nil
		res.Error = sdk.ExtractHTTPError(sdk.NewErrorFrom(sdk.ErrWrongRequest, "invalid workflow v3 format: %v", err)).Error()
		res.ExternalDependencies = extDep

		return service.WriteJSON(w, res, http.StatusOK)
	}
}
