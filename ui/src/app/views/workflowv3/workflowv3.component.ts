import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { Store } from '@ngxs/store';
import { Project } from 'app/model/project.model';
import { AutoUnsubscribe } from 'app/shared/decorator/autoUnsubscribe';
import { ProjectState, ProjectStateModel } from 'app/store/project.state';
import { Subscription } from 'rxjs';
import { GraphDirection } from './graph/workflowv3-graph.lib';
import { WorkflowV3StagesGraphComponent } from './graph/workflowv3-stages-graph.component';
import { WorkflowV3 } from './workflowv3.model';

@Component({
    selector: 'app-workflowv3',
    templateUrl: './workflowv3.html',
    styleUrls: ['./workflowv3.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@AutoUnsubscribe()
export class WorkflowV3Component implements OnInit, OnDestroy {
    @ViewChild('graph') graph: WorkflowV3StagesGraphComponent;
    @ViewChild('grabber') grabber: ElementRef;
    @ViewChild('editor') editor: ElementRef;

    data: WorkflowV3;
    direction: GraphDirection = GraphDirection.VERTICAL;

    projectSubscription: Subscription;
    project: Project;
    grabbing = false;

    constructor(
        private _cd: ChangeDetectorRef,
        private _store: Store,
        private _renderer: Renderer2
    ) { }

    ngOnDestroy(): void { } // Should be set to use @AutoUnsubscribe with AOT

    ngOnInit(): void {
        this.projectSubscription = this._store.select(ProjectState).subscribe((projectState: ProjectStateModel) => {
            this.project = projectState.project;
        });
    }

    workflowEdit(data: WorkflowV3) {
        this.data = data;
        this._cd.markForCheck();
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
            this._renderer.setStyle(this.editor.nativeElement, 'width', `${editorWidth - 4}px`);
            this._renderer.setStyle(this.editor.nativeElement, 'flex', 'unset');
            this._cd.detectChanges();
        }
    }
}
