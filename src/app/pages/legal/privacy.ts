import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-privacy',
    imports: [CommonModule, RouterModule],
    templateUrl: './privacy.html',
    styleUrl: './legal.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Privacy { }
