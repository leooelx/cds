import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Project } from 'app/model/project.model';
import { AutoUnsubscribe } from 'app/shared/decorator/autoUnsubscribe';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { GraphDirection } from '../graph/workflowv3-graph.lib';
import { WorkflowV3StagesGraphComponent } from '../graph/workflowv3-stages-graph.component';
import { WorkflowRunV3 } from '../workflowv3.model';

@Component({
    selector: 'app-workflowv3-run',
    templateUrl: './workflowv3-run.html',
    styleUrls: ['./workflowv3-run.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@AutoUnsubscribe()
export class WorkflowV3RunComponent implements OnInit, OnDestroy {
    @ViewChild('graph') graph: WorkflowV3StagesGraphComponent;
    @ViewChild('grabber') grabber: ElementRef;
    @ViewChild('logs') logs: ElementRef;

    data: WorkflowRunV3;
    direction: GraphDirection = GraphDirection.VERTICAL;
    project: Project;
    grabbing = false;
    loading = false;

    constructor(
        private _cd: ChangeDetectorRef,
        private _renderer: Renderer2,
        private _http: HttpClient,
        private _activatedRoute: ActivatedRoute
    ) { }

    ngOnDestroy(): void { } // Should be set to use @AutoUnsubscribe with AOT

    ngOnInit(): void {
        const parentParams = this._activatedRoute.snapshot.parent.params;
        const params = this._activatedRoute.snapshot.params;
        const projectKey = parentParams['key'];
        const workflowName = parentParams['workflowName'];
        const runNumber = params['number'];

        this.loading = true;
        this._cd.markForCheck();
        this.getWorkflowRun(projectKey, workflowName, runNumber)
            .pipe(finalize(() => {
                this.loading = false;
                this._cd.markForCheck();
            }))
            .subscribe(wr => {
                this.data = wr;
            });
    }

    onMouseDownGrabber(): void {
        this.grabbing = true;
        this._cd.markForCheck();
    }

    @HostListener('mouseup', ['$event'])
    onMouseUpGrabber(): void {
        this.grabbing = false;
        this._cd.markForCheck();
        if (this.graph) {
            this.graph.resize();
        }
    }

    @HostListener('mousemove', ['$event'])
    onMouseMove(event: any): void {
        if (this.grabbing) {
            let editorWidth = Math.max(window.innerWidth - event.clientX, 400);
            this._renderer.setStyle(this.logs.nativeElement, 'width', `${editorWidth - 4}px`);
            this._renderer.setStyle(this.logs.nativeElement, 'flex', 'unset');
            this._cd.detectChanges();
        }
    }

    getWorkflowRun(projectKey: string, workflowName: string, runNumber: number): Observable<WorkflowRunV3> {
        let params = new HttpParams();
        params = params.append('format', 'json');
        params = params.append('full', 'true');
        return this._http.get<WorkflowRunV3>(`/project/${projectKey}/workflowv3/${workflowName}/run/${runNumber}`, { params });
    }
}
