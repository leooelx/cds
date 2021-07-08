import { ModuleWithProviders } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthenticationGuard } from 'app/guard/authentication.guard';
import { NoAuthenticationGuard } from 'app/guard/no-authentication.guard';
import { ProjectForWorkflowResolver } from 'app/service/services.module';
import { WorkflowV3Component } from './workflowv3.component';
import { WorkflowV3Module } from './workflowv3.module';

const workflowRoutes: Routes = [
    {
        path: '',
        component: WorkflowV3Component,
        canActivate: [AuthenticationGuard],
        canActivateChild: [NoAuthenticationGuard],
        resolve: {
            project: ProjectForWorkflowResolver
        },
        data: {
            title: 'Workflow V3'
        }
    }
];


export const workflowV3Routing: ModuleWithProviders<WorkflowV3Module> = RouterModule.forChild(workflowRoutes);
