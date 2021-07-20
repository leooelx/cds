import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy } from '@angular/core';
import { PipelineStatus } from 'app/model/pipeline.model';
import { AutoUnsubscribe } from 'app/shared/decorator/autoUnsubscribe';
import { GraphNode } from '../workflowv3.model';

@Component({
    selector: 'app-workflowv3-job-node',
    templateUrl: './workflowv3-job-node.html',
    styleUrls: ['./workflowv3-job-node.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@AutoUnsubscribe()
export class WorkflowV3JobNodeComponent implements OnDestroy {
    @Input() node: GraphNode;
    @Input() highlightCallback: any;

    highlight = false;
    pipelineStatusEnum = PipelineStatus;

    constructor(
        private _cd: ChangeDetectorRef
    ) {
        this.setHighlight.bind(this);
    }
    getNodes() { return [this.node]; }

    ngOnDestroy(): void { } // Should be set to use @AutoUnsubscribe with AOT

    onMouseEnter(): void {
        if (this.highlightCallback) {
            this.highlightCallback(true, this.node);
        }
    }

    onMouseOut(): void {
        if (this.highlightCallback) {
            this.highlightCallback(false, this.node);
        }
    }

    setHighlight(active: boolean): void {
        this.highlight = active;
        this._cd.markForCheck();
    }
}
