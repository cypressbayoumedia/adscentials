import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-terms',
    imports: [CommonModule, RouterModule],
    templateUrl: './terms.html',
    styleUrl: './legal.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Terms { }
