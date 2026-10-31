import { Component } from '@angular/core';

interface MenuItem {
  path: string;
  title: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  readonly menu: MenuItem[] = [
    { path: '/grid', title: 'Основная страница' },
    { path: '/settings', title: 'Сохранённые настройки' },
    { path: '/about', title: 'О программе' },
  ];
}
