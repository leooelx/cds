import { CUSTOM_ELEMENTS_SCHEMA, NgModule, NO_ERRORS_SCHEMA } from '@angular/core';
import { SharedModule } from 'app/shared/shared.module';
import { WorkflowV3EditComponent } from './edit/workflowv3-edit.component';
import { WorkflowV3ForkJoinNodeComponent } from './graph/workflowv3-fork-join-node.components';
import { WorkflowV3JobNodeComponent } from './graph/workflowv3-job-node.component';
import { WorkflowV3JobsGraphComponent } from './graph/workflowv3-jobs-graph.component';
import { WorkflowV3StagesGraphComponent } from './graph/workflowv3-stages-graph.component';
import { WorkflowV3Component } from './workflowv3.component';
import { workflowV3Routing } from './workflowv3.routing';

@NgModule({
    declarations: [
        WorkflowV3Component,
        WorkflowV3JobNodeComponent,
        WorkflowV3ForkJoinNodeComponent,
        WorkflowV3StagesGraphComponent,
        WorkflowV3JobsGraphComponent,
        WorkflowV3EditComponent
    ],
    imports: [
        SharedModule,
        workflowV3Routing
    ],
    schemas: [
        CUSTOM_ELEMENTS_SCHEMA,
        NO_ERRORS_SCHEMA
    ]
})
export class WorkflowV3Module {
}
