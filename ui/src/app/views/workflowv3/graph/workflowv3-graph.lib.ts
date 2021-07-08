import { ComponentRef } from '@angular/core';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import { GraphNode } from '../workflowv3.model';

export enum GraphDirection {
    HORIZONTAL = 'horizontal',
    VERTICAL = 'vertical'
}

export interface WithHighlight {
    getNodes(): Array<GraphNode>;
    setHighlight(active: boolean): void;
}

export type ComponentFactory<T> = (nodes: Array<GraphNode>, type: string) => ComponentRef<T>;
export class Node {
    key: string;
    hasParent: boolean;
    hasChild: boolean;
    weight: number;
    width: number;
    height: number;
}
export class Edge {
    from: string;
    to: string;
    options: {};
}

export class WorkflowV3Graph<T extends WithHighlight> {
    static margin = 40; // let 40px on top and bottom of the graph
    static marginSubGraph = 20; // let 20px on top and bottom of the sub graph
    static maxOriginScale = 1;
    static baseStageWidth = 300;
    static minStageWidth = 200;
    static minJobWidth = 60;

    nodesComponent = new Map<string, ComponentRef<T>>();
    nodes = new Array<Node>();
    edges = new Array<Edge>();
    direction: string;
    zoom: d3.ZoomBehavior<Element, {}>;
    svg: d3.Selection<any, any, any, any>;
    g: d3.Selection<any, any, any, any>;
    graph: dagreD3.graphlib.Graph;
    render: dagreD3.Render;
    minScale = 1;
    maxScale = 1;
    transformed: any = null;
    componentFactory: ComponentFactory<T>;
    nodeOutNames: { [key: string]: string } = {};
    nodeInNames: { [key: string]: string } = {};
    forks: { [key: string]: Array<string> } = {};
    joins: { [key: string]: Array<string> } = {};

    constructor(
        factory: ComponentFactory<T>,
        direction: GraphDirection,
        minScale: number,
        maxScale: number
    ) {
        this.componentFactory = factory;
        this.direction = direction;
        this.graph = new dagreD3.graphlib.Graph().setGraph({
            rankdir: this.direction === GraphDirection.VERTICAL ? 'TB' : 'LR',
            nodesep: 10,
            ranksep: 10,
            edgesep: 0
        });
        this.minScale = minScale;
        this.maxScale = maxScale;
        this.render = new dagreD3.render();
        this.render.shapes().customRectH = WorkflowV3Graph.customRect(GraphDirection.HORIZONTAL);
        this.render.shapes().customRectV = WorkflowV3Graph.customRect(GraphDirection.VERTICAL);
        this.render.shapes().customCircle = WorkflowV3Graph.customCircle;
    }

    static customRect = (direction: GraphDirection) => (parent, bbox, node) => {
        let shapeSvg = parent.insert('rect', ':first-child')
            .attr('rx', node.rx)
            .attr('ry', node.ry)
            .attr('x', -bbox.width / 2)
            .attr('y', -bbox.height / 2)
            .attr('width', bbox.width)
            .attr('height', bbox.height);

        if (node.hasParent) {
            parent.insert('line')
                .style('stroke-width', 2)
                .style('stroke', '#B5B7BD')
                .attr('x1', direction === GraphDirection.VERTICAL ? 0 : -bbox.width / 2)
                .attr('y1', direction === GraphDirection.VERTICAL ? -bbox.height / 2 : 0)
                .attr('x2', direction === GraphDirection.VERTICAL ? 0 : (-bbox.width / 2) + 10)
                .attr('y2', direction === GraphDirection.VERTICAL ? (-bbox.height / 2) + 10 : 0)
                .attr('class', 'in');
        }

        if (node.hasChild) {
            parent.insert('line')
                .style('stroke-width', 2)
                .style('stroke', '#B5B7BD')
                .attr('x1', direction === GraphDirection.VERTICAL ? 0 : (bbox.width / 2) - 10)
                .attr('y1', direction === GraphDirection.VERTICAL ? (bbox.height / 2) - 10 : 0)
                .attr('x2', direction === GraphDirection.VERTICAL ? 0 : bbox.width / 2)
                .attr('y2', direction === GraphDirection.VERTICAL ? bbox.height / 2 : 0)
                .attr('class', 'out');
        }

        node.intersect = (point) => {
            if (direction === GraphDirection.VERTICAL) {
                const h = ((node.height) / 2) - 1;
                return { x: node.x, y: node.y + (point.y < node.y ? -h : h) };
            }
            const w = ((node.width) / 2) - 1;
            return { x: node.x + (point.x < node.x ? -w : w), y: node.y };
        };

        return shapeSvg;
    };

    static customCircle = (parent, bbox, node) => {
        let r = Math.max(bbox.width, bbox.height) / 2;
        let shapeSvg = parent.insert('circle', ':first-child')
            .attr('x', -bbox.width / 2)
            .attr('y', -bbox.height / 2)
            .attr('r', r);

        node.intersect = point => ({ x: node.x, y: node.y });

        return shapeSvg;
    };

    resize(width: number, height: number): void {
        if (!this.svg) { return; }
        this.svg.attr('width', width);
        this.svg.attr('height', height);
    }

    clean(): void {
        this.graph.edges().forEach(e => this.graph.removeEdge(e.v, e.w));
        this.graph.nodes().forEach(n => this.graph.removeNode(n));
        this.nodesComponent.forEach(c => c.destroy());
        this.nodesComponent = new Map<string, ComponentRef<T>>();
        this.nodes = new Array<Node>();
        this.edges = new Array<Edge>();
    }

    draw(element: any, withZoom: boolean): void {
        d3.select(element).selectAll('svg').remove();
        this.svg = d3.select(element).insert('svg');
        this.g = this.svg.insert('g');

        this.drawNodes();
        this.drawEdges();

        this.render(this.g, <any>this.graph);

        if (withZoom) {
            this.zoom = d3.zoom().scaleExtent([this.minScale, this.maxScale]).on('zoom', () => {
                if (d3.event.transform && d3.event.transform.x && d3.event.transform.x !== Number.POSITIVE_INFINITY
                    && d3.event.transform.y && d3.event.transform.y !== Number.POSITIVE_INFINITY) {
                    this.g.attr('transform', d3.event.transform);
                    this.transformed = d3.event.transform;
                }
            });
            this.svg.call(this.zoom);

            if (!!this.transformed) {
                this.svg.call(this.zoom.transform,
                    d3.zoomIdentity.translate(this.transformed.x, this.transformed.y).scale(this.transformed.k));
            }
        }
    }

    center(containerWidth: number, containerHeight: number): void {
        if (this.zoom) {
            let w = containerWidth - WorkflowV3Graph.margin * 2;
            let h = containerHeight - WorkflowV3Graph.margin * 2;
            let gw = this.graph.graph().width;
            let gh = this.graph.graph().height;
            let oScale = Math.min(w / gw, h / gh); // calculate optimal scale for current graph
            // calculate final scale that fit min and max scale values
            let scale = Math.min(
                WorkflowV3Graph.maxOriginScale,
                Math.max(this.minScale, oScale)
            );
            let centerX = (w - gw * scale + WorkflowV3Graph.margin * 2) / 2;
            let centerY = (h - gh * scale + WorkflowV3Graph.margin * 2) / 2;
            this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(centerX, centerY).scale(scale));
        } else {
            let w = containerWidth - WorkflowV3Graph.marginSubGraph * 2;
            let h = containerHeight - WorkflowV3Graph.marginSubGraph * 2;
            let gw = this.graph.graph().width;
            let gh = this.graph.graph().height;
            let oScale = Math.min(w / gw, h / gh); // calculate optimal scale for current graph
            let centerX = (w - gw * oScale + WorkflowV3Graph.marginSubGraph * 2) / 2;
            let centerY = (h - gh * oScale + WorkflowV3Graph.marginSubGraph * 2) / 2;
            this.g.attr('transform', `translate(${centerX}, ${centerY}) scale(${oScale})`);
        }
        this.transformed = null;
    }

    centerNode(nodeName: string, containerWidth: number, containerHeight: number): void {
        if (!this.zoom) {
            return;
        }
        let node = this.graph.node(nodeName);
        // calculate optimal scale for current graph
        let oScale = Math.min((containerWidth - WorkflowV3Graph.margin * 2) / 300,
            (containerHeight - WorkflowV3Graph.margin * 2) / 169);
        // calculate final scale that fit min and max scale values
        let scale = Math.max(this.minScale, oScale);
        let nodeDeltaCenterX = containerWidth / 2 - node.x * scale;
        let nodeDeltaCenterY = containerHeight / 2 - node.y * scale;
        this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(nodeDeltaCenterX, nodeDeltaCenterY).scale(scale));
    }

    drawNodes(): void {
        this.nodes.forEach(n => {
            this.createGNode(`node-${n.key}`, this.nodesComponent.get(`node-${n.key}`), n.width, n.height, {
                hasParent: n.hasParent,
                hasChild: n.hasChild,
                class: n.key
            });
        });
    }

    drawEdges(): void {
        let nodesChildren: { [key: string]: Array<string> } = {};
        let nodesParents: { [key: string]: Array<string> } = {};

        let unique = (a: Array<string>): Array<string> => {
            let o = {};
            a.forEach(s => o[s] = true);
            return Object.keys(o);
        };

        this.edges.forEach(e => {
            if (!nodesChildren[e.from]) {
                nodesChildren[e.from] = [e.to];
            } else {
                nodesChildren[e.from] = unique([...nodesChildren[e.from], e.to]);
            }
            if (!nodesParents[e.to]) {
                nodesParents[e.to] = [e.from];
            } else {
                nodesParents[e.to] = unique([...nodesParents[e.to], e.from]);
            }
        });

        // Create fork
        this.forks = {};
        this.nodeOutNames = {};
        Object.keys(nodesChildren).forEach(c => {
            if (nodesChildren[c].length > 1) {
                let keyFork = nodesChildren[c].map(n => n.split('node-')[1]).sort().join('-');
                if (this.forks[keyFork]) {
                    this.forks[keyFork] = this.forks[keyFork].concat(c);
                } else {
                    this.forks[keyFork] = [c];
                }
            }
        });
        Object.keys(this.forks).forEach(f => {
            let nodes = this.forks[f].map(n => this.nodesComponent.get(n).instance.getNodes()).reduce((p, c) => p.concat(c));
            const componentRef = this.componentFactory(nodes, 'fork');
            let nodeKeys = this.forks[f].map(n => n.split('node-')[1]).sort().join(' ');
            this.createGFork(f, componentRef, { class: `${nodeKeys}` });
            this.forks[f].forEach(n => {
                this.createGEdge(<Edge>{
                    from: n,
                    to: `fork-${f}`,
                    options: {
                        class: `${f} ${n.split('node-')[1]}`
                    }
                });
                this.nodeOutNames[n] = `fork-${f}`;
            });
        });

        // Create join
        this.joins = {};
        this.nodeInNames = {};
        Object.keys(nodesParents).forEach(p => {
            if (nodesParents[p].length > 1) {
                let keyJoin = nodesParents[p].map(n => n.split('node-')[1]).sort().join('-');
                if (this.joins[keyJoin]) {
                    this.joins[keyJoin] = this.joins[keyJoin].concat(p);
                } else {
                    this.joins[keyJoin] = [p];
                }
            }
        });
        Object.keys(this.joins).forEach(j => {
            let nodes = this.joins[j].map(n => this.nodesComponent.get(n).instance.getNodes()).reduce((p, c) => p.concat(c));
            const componentRef = this.componentFactory(nodes, 'join');
            let nodeKeys = this.joins[j].map(n => n.split('node-')[1]).sort().join(' ');
            this.createGJoin(j, componentRef, { class: `${nodeKeys}` });
            this.joins[j].forEach(n => {
                this.createGEdge(<Edge>{
                    from: `join-${j}`,
                    to: n,
                    options: {
                        class: `${j} ${n.split('node-')[1]}`
                    }
                });
                this.nodeInNames[n] = `join-${j}`;
            });
        });

        let uniqueEdges: { [key: string]: { from: string, to: string, classes: Array<string>, weight: number } } = {};
        this.edges.forEach(e => {
            let from = this.nodeOutNames[e.from] ?? e.from;
            let to = this.nodeInNames[e.to] ?? e.to;
            let edgeKey = `${from}-${to}`;
            let nodeKeyFrom = e.from.split('node-')[1];
            let nodeKeyTo = e.to.split('node-')[1];
            let toNodeWeight = this.nodes.find(n => n.key === nodeKeyTo).weight;
            if (!uniqueEdges[edgeKey]) {
                uniqueEdges[edgeKey] = { from, to, classes: [nodeKeyFrom, nodeKeyTo], weight: toNodeWeight };
                return;
            }
            uniqueEdges[edgeKey].classes = unique(uniqueEdges[edgeKey].classes.concat(nodeKeyFrom, nodeKeyTo));
            uniqueEdges[edgeKey].weight = Math.max(toNodeWeight, uniqueEdges[edgeKey].weight);
        });

        Object.keys(uniqueEdges).forEach(edgeKey => {
            let e = uniqueEdges[edgeKey];
            this.createGEdge(<Edge>{
                from: e.from, to: e.to, options: {
                    class: e.classes.join(' '),
                    weight: e.weight
                }
            });
        });
    }

    createNode(key: string, componentRef: ComponentRef<T>, hasParent: boolean, hasChild: boolean, weight: number, width: number = 180, height: number = 60): void {
        this.nodes.push(<Node>{ key, hasParent, hasChild, weight, width, height });
        this.nodesComponent.set(`node-${key}`, componentRef);
    }

    createGNode(name: string, componentRef: ComponentRef<T>, width: number, height: number, options: {}): void {
        this.graph.setNode(name, <any>{
            shape: this.direction === GraphDirection.VERTICAL ? 'customRectV' : 'customRectH',
            label: () => componentRef.location.nativeElement,
            labelStyle: `width: ${width}px;height: ${height}px;`,
            ...options
        });
    }

    createGFork(key: string, componentRef: ComponentRef<T>, options: {}): void {
        this.nodesComponent.set(`fork-${key}`, componentRef);
        this.createGNode(`fork-${key}`, componentRef, 20, 20, {
            shape: 'customCircle',
            width: 60,
            height: 60,
            ...options
        });
    }

    createGJoin(key: string, componentRef: ComponentRef<T>, options: {}): void {
        this.nodesComponent.set(`join-${key}`, componentRef);
        this.createGNode(`join-${key}`, componentRef, 20, 20, {
            shape: 'customCircle',
            width: 60,
            height: 60,
            ...options
        });
    }

    createEdge(from: string, to: string): void {
        this.edges.push(<Edge>{ from, to });
    }

    createGEdge(e: Edge): void {
        this.graph.setEdge(e.from, e.to, {
            arrowhead: 'undirected',
            style: 'stroke: #B5B7BD;stroke-width: 2px;',
            curve: d3.curveBasis,
            ...e.options
        });
    }

    highlightNode(active: boolean, key: string) {
        let selectionEdges = d3.selectAll(`.${key} > .path`);
        if (selectionEdges.size() > 0) {
            selectionEdges.style('stroke', active ? '#FFFFFF' : '#B5B7BD');
        }
        let selectionNodesLines = d3.selectAll(`.${key} > line`);
        if (selectionNodesLines.size() > 0) {
            selectionNodesLines.style('stroke', active ? '#FFFFFF' : '#B5B7BD');
        }

        let from = this.nodeOutNames[`node-${key}`] ?? `node-${key}`;
        this.graph.edges().filter(e => e.v === from).forEach(e => {
            let nodeKeys: Array<string>;
            if (e.w.startsWith('fork-')) {
                nodeKeys = this.forks[e.w.split('fork-')[1]];
            } else if (e.w.startsWith('join-')) {
                nodeKeys = this.joins[e.w.split('join-')[1]];
            } else {
                nodeKeys = [e.w.split('node-')[1]];
            }
            nodeKeys.forEach(nodeKey => {
                let selectionNodesInLines = d3.selectAll(`.${nodeKey} > line.in`);
                if (selectionNodesInLines.size() > 0) {
                    selectionNodesInLines.style('stroke', active ? '#FFFFFF' : '#B5B7BD');
                }
            });
        });
        let to = this.nodeInNames[`node-${key}`] ?? `node-${key}`;
        this.graph.edges().filter(e => e.w === to).forEach(e => {
            let nodeKeys: Array<string>;
            if (e.v.startsWith('fork-')) {
                nodeKeys = this.forks[e.v.split('fork-')[1]];
            } else if (e.v.startsWith('join-')) {
                nodeKeys = this.joins[e.v.split('join-')[1]];
            } else {
                nodeKeys = [e.v.split('node-')[1]];
            }
            nodeKeys.forEach(nodeKey => {
                let selectionNodesInLines = d3.selectAll(`.${nodeKey} > line.out`);
                if (selectionNodesInLines.size() > 0) {
                    selectionNodesInLines.style('stroke', active ? '#FFFFFF' : '#B5B7BD');
                }
            });
        });
        if (this.nodesComponent.has(`node-${key}`)) {
            this.nodesComponent.get(`node-${key}`).instance.setHighlight(active);
        }
        let inName = this.nodeInNames[`node-${key}`];
        if (inName !== `node-${key}`) {
            if (this.nodesComponent.has(inName)) {
                this.nodesComponent.get(inName).instance.setHighlight(active);
            }
        }
        let outName = this.nodeOutNames[`node-${key}`];
        if (outName !== `node-${key}`) {
            if (this.nodesComponent.has(outName)) {
                this.nodesComponent.get(outName).instance.setHighlight(active);
            }
        }
    }
}
