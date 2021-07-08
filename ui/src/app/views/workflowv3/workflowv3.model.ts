export class WorkflowV3ValidationResponse {
    valid: boolean;
    error: string;
    workflow: WorkflowV3;
    external_dependencies: Array<any>;
}

export class WorkflowV3 {
    name: string;
    stages: { [name: string]: Stage };
    jobs: { [name: string]: Job };
}

export class Stage {
    depends_on: Array<string>;
    conditions: any;
}

export class Job {
    enabled: boolean;
    description: string;
    conditions: any;
    context: any;
    stage: string;
    steps: Array<any>;
    requirements: Array<any>;
    depends_on: Array<string>;
}

export class GraphNode {
    name: string;
    depends_on: Array<string>;
    sub_graph: Array<GraphNode>;

    static ComputeWeight(graph: Array<GraphNode>): { [name: string]: number } {
        let f = (nodes: Array<GraphNode>, rank: number = 0): { [name: string]: number } => {
            let rootNodeNames = nodes.filter(n => !n.depends_on || n.depends_on.length === 0).map(n => n.name);
            let nodesWeight = {};
            rootNodeNames.forEach(n => nodesWeight[n] = rank);
            let nodesLeft = nodes.filter(n => n.depends_on && n.depends_on.length > 0).map(n => ({
                ...n,
                depends_on: n.depends_on.filter(d => !rootNodeNames.includes(d))
            }));
            if (nodes.length > 0) {
                nodesWeight = {
                    ...nodesWeight,
                    ...f(nodesLeft, rank - 1)
                };
            }
            return nodesWeight;
        };

        let res = f(graph);
        let minWeight = 0;
        Object.keys(res).forEach(k => { if (res[k] < minWeight) { minWeight = res[k]; } });
        Object.keys(res).forEach(k => res[k] += -minWeight);
        return res;
    }
}
