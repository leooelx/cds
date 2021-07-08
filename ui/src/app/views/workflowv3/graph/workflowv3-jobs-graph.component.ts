import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ComponentFactoryResolver,
    ComponentRef,
    Input,
    OnDestroy,
    ViewChild,
    ViewContainerRef
} from '@angular/core';
import { AutoUnsubscribe } from 'app/shared/decorator/autoUnsubscribe';
import { GraphNode } from '../workflowv3.model';
import { WorkflowV3ForkJoinNodeComponent } from './workflowv3-fork-join-node.components';
import { GraphDirection, WorkflowV3Graph } from './workflowv3-graph.lib';
import { WorkflowV3JobNodeComponent } from './workflowv3-job-node.component';

export type WorkflowV3NodeComponent = WorkflowV3ForkJoinNodeComponent | WorkflowV3JobNodeComponent;

@Component({
    selector: 'app-workflowv3-jobs-graph',
    templateUrl: './workflowv3-jobs-graph.html',
    styleUrls: ['./workflowv3-jobs-graph.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
@AutoUnsubscribe()
export class WorkflowV3JobsGraphComponent implements AfterViewInit, OnDestroy {
    static maxScale = 2;
    static minScale = 0.1;

    node: GraphNode;
    nodes: Array<GraphNode> = [];
    @Input() set graphNode(data: GraphNode) {
        this.node = data;
        this.nodes = data.sub_graph;
        this.changeDisplay();
    }
    @Input() direction: GraphDirection;
    @Input() centerCallback: any;
    @Input() highlightCallback: any;

    ready: boolean;
    highlight = false;

    // workflow graph
    @ViewChild('svgSubGraph', { read: ViewContainerRef }) svgContainer: ViewContainerRef;
    graph: WorkflowV3Graph<WorkflowV3NodeComponent>;

    constructor(
        private componentFactoryResolver: ComponentFactoryResolver,
        private _cd: ChangeDetectorRef
    ) { }

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

    ngAfterViewInit(): void {
        this.ready = true;
        this._cd.detectChanges();
        this.changeDisplay();
    }

    changeDisplay(): void {
        if (!this.ready) {
            return;
        }
        this.initGraph();
    }

    initGraph() {
        if (this.graph) {
            this.graph.clean();
        }
        if (!this.graph || this.graph.direction !== this.direction) {
            this.graph = new WorkflowV3Graph(this.createForkJoinNodeComponent.bind(this), this.direction,
                WorkflowV3JobsGraphComponent.minScale, WorkflowV3JobsGraphComponent.maxScale);
        }

        let nodesWeight = GraphNode.ComputeWeight(this.nodes);

        this.nodes.forEach(n => {
            let childCount = 0;
            this.nodes.forEach(o => {
                childCount += o.depends_on ? o.depends_on.filter(d => d === n.name).length : 0;
            });
            this.graph.createNode(`${this.node.name}-${n.name}`, this.createJobNodeComponent(n), n.depends_on?.length > 0, childCount > 0, nodesWeight[n.name]);
        });

        this.nodes.forEach(n => {
            if (n.depends_on && n.depends_on.length > 0) {
                n.depends_on.forEach(d => {
                    this.graph.createEdge(`node-${this.node.name}-${d}`, `node-${this.node.name}-${n.name}`);
                });
            }
        });

        const element = this.svgContainer.element.nativeElement;
        this.graph.draw(element, false);
        this.graph.center(300, 169);
        this._cd.markForCheck();
    }

    createJobNodeComponent(node: GraphNode): ComponentRef<WorkflowV3JobNodeComponent> {
        const nodeComponentFactory = this.componentFactoryResolver.resolveComponentFactory(WorkflowV3JobNodeComponent);
        const componentRef = this.svgContainer.createComponent<WorkflowV3JobNodeComponent>(nodeComponentFactory);
        componentRef.instance.node = node;
        componentRef.instance.highlightCallback = this.highlightNode.bind(this);
        componentRef.changeDetectorRef.detectChanges();
        return componentRef;
    }

    createForkJoinNodeComponent(nodes: Array<GraphNode>, type: string): ComponentRef<WorkflowV3ForkJoinNodeComponent> {
        const nodeComponentFactory = this.componentFactoryResolver.resolveComponentFactory(WorkflowV3ForkJoinNodeComponent);
        const componentRef = this.svgContainer.createComponent<WorkflowV3ForkJoinNodeComponent>(nodeComponentFactory);
        componentRef.instance.nodes = nodes;
        componentRef.instance.type = type;
        componentRef.instance.highlightCallback = this.highlightNode.bind(this);
        componentRef.changeDetectorRef.detectChanges();
        return componentRef;
    }

    highlightNode(active: boolean, n: GraphNode) {
        this.graph.highlightNode(active, `${this.node.name}-${n.name}`);
    }

    clickCenter(): void {
        if (this.centerCallback) { this.centerCallback(this.node); }
    }
}
