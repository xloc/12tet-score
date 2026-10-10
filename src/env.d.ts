declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

interface Navigator {
  readonly bluetooth?: import('./bluetooth-midi').Bluetooth;
}
