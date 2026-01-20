
import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
    constructor(private readonly title: Title) {
        super();
    }

    override updateTitle(snapshot: RouterStateSnapshot) {
        const title = this.buildTitle(snapshot);
        if (title !== undefined) {
            this.title.setTitle(`${title} | Adscentials`);
        } else {
            this.title.setTitle('Adscentials | Creator Ad Inventory');
        }
    }
}
