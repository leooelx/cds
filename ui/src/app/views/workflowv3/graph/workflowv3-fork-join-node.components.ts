import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { PipelineStatus } from 'app/model/pipeline.model';
import { AutoUnsubscribe } from 'app/shared/decorator/autoUnsubscribe';
import { GraphNode } from '../workflowv3.model';

@Component({
    selector: 'app-workflowv3-fork-join-node',
    templateUrl: './workflowv3-fork-join-node.html',
    styleUrls: ['./workflowv3-fork-join-node.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@AutoUnsubscribe()
export class WorkflowV3ForkJoinNodeComponent implements OnInit, OnDestroy {
    @Input() nodes: Array<GraphNode>;
    @Input() type = 'fork';
    @Input() highlightCallback: any;

    highlight = false;
    status: string;
    pipelineStatusEnum = PipelineStatus;

    constructor(
        private _cd: ChangeDetectorRef
    ) {
        this.setHighlight.bind(this);
    }

    ngOnInit() {
        this.status = PipelineStatus.sum(this.nodes.map(n => n.run ? n.run.status : null));
    }

    getNodes() { return this.nodes; }

    ngOnDestroy(): void { } // Should be set to use @AutoUnsubscribe with AOT

    onMouseEnter(): void {
        if (this.highlightCallback) {
            this.nodes.forEach(n => {
                this.highlightCallback(true, n);
            });
        }
    }

    onMouseOut(): void {
        if (this.highlightCallback) {
            this.nodes.forEach(n => {
                this.highlightCallback(false, n);
            });
        }
    }

    setHighlight(active: boolean): void {
        this.highlight = active;
        this._cd.markForCheck();
    }
}
