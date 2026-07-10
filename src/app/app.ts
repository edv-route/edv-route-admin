import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { initFlowbite } from 'flowbite';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  constructor() {
    // Flowbite interactive components (drawers, dropdowns, modals...) bind to
    // data-* attributes. Re-scan after every navigation so components inside
    // lazy-loaded routes get wired up too (idempotent).
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => setTimeout(() => initFlowbite()));
  }
}
