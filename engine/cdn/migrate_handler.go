package cdn

import (
	"bufio"
	"context"
	"crypto/md5"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"

	"github.com/gorilla/mux"

	"github.com/ovh/cds/engine/cdn/item"
	"github.com/ovh/cds/engine/cdn/storage"
	"github.com/ovh/cds/engine/service"
	"github.com/ovh/cds/sdk"
	"github.com/ovh/cds/sdk/cdn"
)

func (s *Service) migrateArtifactInCDNHandler() service.Handler {
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request) error {
		vars := mux.Vars(r)
		projectKey := vars["projectKey"]
		workflowName := vars["workflowName"]
		var artifact sdk.WorkflowNodeRunArtifact
		if err := service.UnmarshalBody(r, &artifact); err != nil {
			return err
		}

		bufferUnit := s.Units.FileBuffer()

		fakeSig := cdn.Signature{
			ProjectKey:   projectKey,
			WorkflowName: workflowName,
			WorkflowID:   artifact.WorkflowID,
			RunID:        0,
			NodeRunID:    artifact.WorkflowNodeRunID,
			JobName:      "",
			JobID:        artifact.WorkflowNodeJobRunID,
			Worker: &cdn.SignatureWorker{
				FileName:      artifact.Name,
				FilePerm:      artifact.Perm,
				RunResultType: string(sdk.CDNTypeItemRunResult),
			},
		}
		apiRef, err := sdk.NewCDNApiRef(sdk.CDNTypeItemRunResult, fakeSig)
		if err != nil {
			return err
		}
		hashRef, err := apiRef.ToHash()
		if err != nil {
			return err
		}

		// Check Item unicity
		_, err = item.LoadByAPIRefHashAndType(ctx, s.Mapper, s.mustDBWithCtx(ctx), hashRef, sdk.CDNTypeItemRunResult)
		if err == nil {
			return sdk.NewErrorFrom(sdk.ErrInvalidData, "cannot upload the same file twice")
		}
		if !sdk.ErrorIs(err, sdk.ErrNotFound) {
			return err
		}

		it := &sdk.CDNItem{
			APIRef:     apiRef,
			Type:       sdk.CDNTypeItemRunResult,
			APIRefHash: hashRef,
			Status:     sdk.CDNStatusItemIncoming,
		}

		// Call CDS API to check if we can upload the run result
		runResultApiRef, _ := it.GetCDNRunResultApiRef()

		runResultCheck := sdk.WorkflowRunResultCheck{
			Name:       runResultApiRef.ArtifactName,
			ResultType: runResultApiRef.RunResultType,
			RunID:      runResultApiRef.RunID,
			RunNodeID:  runResultApiRef.RunNodeID,
			RunJobID:   runResultApiRef.RunJobID,
		}
		code, err := s.Client.QueueWorkflowRunResultCheck(ctx, fakeSig.JobID, runResultCheck)
		if err != nil {
			if code == http.StatusConflict {
				return sdk.NewErrorFrom(sdk.ErrInvalidData, "unable to upload the same file twice")
			}
			return err
		}

		iu, err := s.Units.NewItemUnit(ctx, bufferUnit, it)
		if err != nil {
			return err
		}

		// Create Destination Writer
		writer, err := bufferUnit.NewWriter(ctx, *iu)
		if err != nil {
			return err
		}

		// Retrive Artifact from CDS API
		url := fmt.Sprintf("/project/%s/workflows/%s/artifact/%d", projectKey, workflowName, artifact.ID)
		readcloser, _, code, err := s.Client.Stream(ctx, s.Client.HTTPNoTimeoutClient(), "POST", url, nil)
		if err != nil {
			return err
		}
		if code >= 400 {
			bts, err := ioutil.ReadAll(readcloser)
			if err != nil {
				return err
			}
			return sdk.NewErrorFrom(sdk.ErrUnknownError, "unable to get artifact: %s", bts)
		}

		// Compute md5 and sha512
		md5Hash := md5.New()
		sha512Hash := sha512.New()
		sizeWriter := &SizeWriter{}
		pagesize := os.Getpagesize()
		mreader := bufio.NewReaderSize(readcloser, pagesize)
		multiWriter := io.MultiWriter(md5Hash, sha512Hash, sizeWriter)

		teeReader := io.TeeReader(mreader, multiWriter)

		if err := bufferUnit.Write(*iu, teeReader, writer); err != nil {
			_ = readcloser.Close()
			_ = writer.Close()
			return sdk.WithStack(err)
		}
		if err := readcloser.Close(); err != nil {
			return sdk.WithStack(err)
		}
		sha512S := hex.EncodeToString(sha512Hash.Sum(nil))
		md5S := hex.EncodeToString(md5Hash.Sum(nil))

		it.Hash = sha512S
		it.MD5 = md5S
		it.Size = sizeWriter.Size
		it.Status = sdk.CDNStatusItemCompleted

		// Insert Item and ItemUnit in database
		tx, err := s.mustDBWithCtx(ctx).Begin()
		if err != nil {
			return sdk.WithStack(err)
		}
		defer tx.Rollback() //nolint

		// Insert Item
		if err := item.Insert(ctx, s.Mapper, tx, it); err != nil {
			return err
		}

		// Insert Item Unit
		iu.ItemID = iu.Item.ID
		if err := storage.InsertItemUnit(ctx, s.Mapper, tx, iu); err != nil {
			return err
		}

		result := sdk.WorkflowRunResultArtifact{
			Name:       apiRef.ToFilename(),
			Size:       it.Size,
			MD5:        it.MD5,
			CDNRefHash: it.APIRefHash,
			Perm:       runResultApiRef.Perm,
		}

		bts, err := json.Marshal(result)
		if err != nil {
			return sdk.WithStack(err)
		}
		wrResult := sdk.WorkflowRunResult{
			WorkflowRunID:     fakeSig.RunID,
			WorkflowNodeRunID: fakeSig.NodeRunID,
			WorkflowRunJobID:  fakeSig.JobID,
			Type:              runResultApiRef.RunResultType,
			DataRaw:           json.RawMessage(bts),
		}
		if err := s.Client.QueueWorkflowRunResultsAdd(ctx, fakeSig.JobID, wrResult); err != nil {
			return err
		}

		s.Units.PushInSyncQueue(ctx, it.ID, it.Created)
		return nil
	}
}
