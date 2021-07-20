import { ModuleWithProviders } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthenticationGuard } from 'app/guard/authentication.guard';
import { ProjectForWorkflowResolver } from 'app/service/services.module';
import { WorkflowV3ShowComponent } from './show/workflowv3-show.component';
import { WorkflowV3Component } from './workflowv3.component';
import { WorkflowV3Module } from './workflowv3.module';

const workflowRoutes: Routes = [
    {
        path: ':workflowName',
        component: WorkflowV3Component,
        canActivate: [AuthenticationGuard],
        canActivateChild: [AuthenticationGuard],
        data: {
            title: '{workflowName} • Workflow V3'
        },
        resolve: {
            project: ProjectForWorkflowResolver
        },
        children: [
            {
                path: '', component: WorkflowV3ShowComponent,
            }
        ]
    }
];


export const workflowV3Routing: ModuleWithProviders<WorkflowV3Module> = RouterModule.forChild(workflowRoutes);
