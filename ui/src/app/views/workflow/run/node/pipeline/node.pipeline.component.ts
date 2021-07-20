import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Select, Store } from '@ngxs/store';
import { CDNLine, CDNStreamFilter, PipelineStatus } from 'app/model/pipeline.model';
import { Project } from 'app/model/project.model';
import { Stage } from 'app/model/stage.model';
import { WorkflowNodeJobRun, WorkflowNodeRun } from 'app/model/workflow.run.model';
import { WorkflowService } from 'app/service/workflow/workflow.service';
import { AutoUnsubscribe } from 'app/shared/decorator/autoUnsubscribe';
import { DurationService } from 'app/shared/duration/duration.service';
import { ProjectState } from 'app/store/project.state';
import { SelectWorkflowNodeRunJob } from 'app/store/workflow.action';
import { WorkflowState, WorkflowStateModel } from 'app/store/workflow.state';
import cloneDeep from 'lodash-es/cloneDeep';
import { Observable, Subscription } from 'rxjs';
import { delay, retryWhen } from 'rxjs/operators';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { ScrollTarget, WorkflowRunJobComponent } from './workflow-run-job/workflow-run-job.component';

@Component({
    selector: 'app-node-run-pipeline',
    templateUrl: './pipeline.html',
    styleUrls: ['./pipeline.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@AutoUnsubscribe()
export class WorkflowRunNodePipelineComponent implements OnInit, OnDestroy {
    readonly initLoadLinesCount = 10;

    @ViewChild('scrollContent') scrollContent: ElementRef;
    @ViewChild('runjobComponent') runjobComponent: WorkflowRunJobComponent;

    @Select(WorkflowState.getSelectedNodeRun()) nodeRun$: Observable<WorkflowNodeRun>;
    nodeRunSubs: Subscription;

    @Select(WorkflowState.getSelectedWorkflowNodeJobRun()) nodeJobRun$: Observable<WorkflowNodeJobRun>;
    nodeJobRunSubs: Subscription;

    workflowName: string;
    project: Project;

    // Pipeline data
    stages: Array<Stage>;
    jobTime: Map<number, string>;
    mapJobStatus: Map<number, { status: string, warnings: number, start: string, done: string }>
        = new Map<number, { status: string, warnings: number, start: string, done: string }>();

    queryParamsSub: Subscription;
    pipelineStatusEnum = PipelineStatus;

    currentNodeRunID: number;
    currentNodeRunNum: number;
    currentNodeJobRun: WorkflowNodeJobRun;
    currentNodeRunStatus: string;

    durationIntervalID: number;

    websocket: WebSocketSubject<any>;
    websocketSubscription: Subscription;

    constructor(
        private _route: ActivatedRoute,
        private _router: Router,
        private _cd: ChangeDetectorRef,
        private _store: Store,
        private _workflowService: WorkflowService
    ) {
        this.project = this._store.selectSnapshot(ProjectState.projectSnapshot);
        this.workflowName = (<WorkflowStateModel>this._store.selectSnapshot(WorkflowState)).workflowRun.workflow.name;
    }

    ngOnInit() {
        this.nodeJobRunSubs = this.nodeJobRun$.subscribe(rj => {
            if (!rj && !this.currentNodeJobRun) {
                this.stopWebsocketSubscription();
                return;
            }
            if (!rj) {
                delete this.currentNodeJobRun;
                this._cd.markForCheck();
                return;
            }

            if (this.currentNodeJobRun && rj.id === this.currentNodeJobRun.id && this.currentNodeJobRun?.status === rj?.status) {
                if (this.currentNodeJobRun?.job?.pipeline_action_id === rj.job.pipeline_action_id) {
                    const stepStatusChanged = rj.job.step_status?.length !== this.currentNodeJobRun.job.step_status?.length;
                    if (!stepStatusChanged) {
                        return;
                    }
                }
            }
            // Update step status data
            this.currentNodeJobRun = cloneDeep(rj);
            // Refresh websocket filter if needed
            this.startStreamingLogsForJob().then(() => {});
            this._cd.markForCheck();
        });

        this.nodeRunSubs = this.nodeRun$.subscribe(nr => {
            if (!nr) {
                return;
            }
            if (this.currentNodeRunID !== nr.id) {
                this.currentNodeRunID = nr.id;
                this.currentNodeRunNum = nr.num;
                this.stages = nr.stages;
                this.refreshNodeRun(nr);
                this.deleteInterval();
                this.updateTime();
                this.durationIntervalID = window.setInterval(() => {
                    this.updateTime();
                }, 5000);
                this._cd.markForCheck();
            } else {
                if (this.refreshNodeRun(nr)) {
                    this._cd.markForCheck();
                }
            }
        });
    }

    async getCDNStreamFilter(): Promise<CDNStreamFilter> {
        // Get links from last step
        let projectKey = this._store.selectSnapshot(ProjectState.projectSnapshot).key;
        let workflowName = this._store.selectSnapshot(WorkflowState.workflowSnapshot).name;
        let link = await this._workflowService.getStepLink(projectKey, workflowName,
            this.currentNodeRunID, this.currentNodeJobRun.id, this.currentNodeJobRun.job.step_status.length - 1).toPromise();

        // Get logs lines
        let result = await this._workflowService.getLogLines(link, { limit: `${this.initLoadLinesCount}` }).toPromise();

        return <CDNStreamFilter>{
            item_type: link.item_type,
            api_ref: link.api_ref,
            offset: result.totalCount > 0 ? -5 : 0
        };
    }

    async startStreamingLogsForJob() {
        if (!this.currentNodeJobRun || !this.currentNodeJobRun.job.step_status) {
            return;
        }

        let cdnFilter = await this.getCDNStreamFilter();

        if (!this.websocket) {
            const protocol = window.location.protocol.replace('http', 'ws');
            const host = window.location.host;
            const href = this._router['location']._baseHref;
            this.websocket = webSocket({
                url: `${protocol}//${host}${href}/cdscdn/item/stream`,
                openObserver: {
                    next: value => {
                        if (value.type === 'open') {
                            this.websocket.next(cdnFilter);
                        }
                    }
                }
            });

            this.websocketSubscription = this.websocket
                .pipe(retryWhen(errors => errors.pipe(delay(2000))))
                .subscribe((l: CDNLine) => {
                    if (this.runjobComponent) {
                        this.runjobComponent.receiveLogs(l);
                    } else {
                        console.log('job component not loaded');
                    }
                }, (err) => {
                    console.error('Error: ', err);
                }, () => {
                    console.warn('Websocket Completed');
                });
        } else {
            this.websocket.next(cdnFilter);
        }
    }

    selectedJobManual(jobID: number) {
        if (!this.mapJobStatus.has(jobID)) {
            return;
        }
        let queryParams = cloneDeep(this._route.snapshot.queryParams);
        queryParams['stageId'] = null;
        queryParams['actionId'] = null;
        queryParams['stepOrder'] = null;
        queryParams['line'] = null;
        this._router.navigate(['.'], { relativeTo: this._route, queryParams, fragment: null });
        this.selectJob(jobID);
    }

    selectJob(jobID: number): void {
        if (jobID === this.currentNodeJobRun?.job?.pipeline_action_id) {
            return;
        }
        this._store.dispatch(new SelectWorkflowNodeRunJob({ jobID }));
    }

    refreshNodeRun(data: WorkflowNodeRun): boolean {
        let refresh = false;
        let currentNodeJobRun = (<WorkflowStateModel>this._store.selectSnapshot(WorkflowState)).workflowNodeJobRun;

        if (this.currentNodeRunStatus !== data.status) {
            this.currentNodeRunStatus = data.status;
            refresh = true;
        }

        if (data.stages) {
            data.stages.forEach((s, sIndex) => {
                // Test Job status
                if (s.run_jobs) {
                    s.run_jobs.forEach((rj, rjIndex) => {
                        let warnings = 0;
                        // compute warning
                        if (rj.job.step_status) {
                            rj.job.step_status.forEach(ss => {
                                if (ss.status === PipelineStatus.FAIL && rj.job.action.actions[ss.step_order] &&
                                    rj.job.action.actions[ss.step_order].optional) {
                                    warnings++;
                                }
                            });
                        }

                        // Update job status
                        let jobStatusItem = this.mapJobStatus.get(rj.job.pipeline_action_id);
                        if (!jobStatusItem || jobStatusItem.status !== rj.status) {
                            refresh = true;
                            this.mapJobStatus.set(rj.job.pipeline_action_id,
                                { status: rj.status, warnings, start: rj.start, done: rj.done });
                        }

                        if (!currentNodeJobRun && sIndex === 0 && rjIndex === 0 && !this._route.snapshot.queryParams['actionId']) {
                            refresh = true;
                            this.selectJob(s.jobs[0].pipeline_action_id);
                        } else if (currentNodeJobRun &&
                            currentNodeJobRun.job.pipeline_action_id === this.currentNodeJobRun.job.pipeline_action_id) {
                            this.selectJob(this.currentNodeJobRun.job.pipeline_action_id);
                        } else if (this._route.snapshot.queryParams['actionId'] &&
                            this._route.snapshot.queryParams['actionId'] === rj.job.pipeline_action_id.toString()) {
                            this.selectJob(rj.job.pipeline_action_id);
                        }
                    });
                }
            });
        }
        return refresh;
    }

    /**
     * Update job time
     */
    updateTime(): void {
        if (!this.mapJobStatus || this.mapJobStatus.size === 0) {
            return;
        }
        if (!this.jobTime) {
            this.jobTime = new Map<number, string>();
        }
        let stillRunning = false;
        let refresh = false;
        this.mapJobStatus.forEach((v, k) => {
            switch (v.status) {
                case this.pipelineStatusEnum.WAITING:
                case this.pipelineStatusEnum.BUILDING:
                    refresh = true;
                    stillRunning = true;
                    this.jobTime.set(k,
                        DurationService.duration(new Date(v.start), new Date()));
                    break;
                case this.pipelineStatusEnum.SUCCESS:
                case this.pipelineStatusEnum.FAIL:
                case this.pipelineStatusEnum.STOPPED:
                    let dd = DurationService.duration(new Date(v.start), new Date(v.done));
                    let item = this.jobTime.get(k);
                    if (!item || item !== dd) {
                        this.jobTime.set(k, dd);
                    }
                    refresh = true;
                    break;
            }
        });

        if (!stillRunning) {
            this.deleteInterval();
            this._cd.markForCheck();
        }
        if (refresh) {
            this._cd.markForCheck();
        }
    }

    ngOnDestroy(): void {
        this.deleteInterval();
        this._store.dispatch(new SelectWorkflowNodeRunJob({ jobID: 0 }));
        this.stopWebsocketSubscription();
    }

    deleteInterval(): void {
        if (this.durationIntervalID) {
            clearInterval(this.durationIntervalID);
            this.durationIntervalID = 0;
        }
    }

    onJobScroll(target: ScrollTarget): void {
        this.scrollContent.nativeElement.scrollTop = target === ScrollTarget.TOP ? 0 : this.scrollContent.nativeElement.scrollHeight;
    }

    stopWebsocketSubscription(): void {
        if (this.websocketSubscription) {
            this.websocketSubscription.unsubscribe();
        }
    }
}
