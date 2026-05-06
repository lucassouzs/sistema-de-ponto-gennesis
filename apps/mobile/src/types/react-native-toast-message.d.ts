declare module 'react-native-toast-message' {
  import { Component } from 'react';
  
  export interface ToastShowParams {
    type?: 'success' | 'error' | 'info';
    text1?: string;
    text2?: string;
    position?: 'top' | 'bottom';
    visibilityTime?: number;
    autoHide?: boolean;
    topOffset?: number;
    bottomOffset?: number;
    onShow?: () => void;
    onHide?: () => void;
    onPress?: () => void;
  }

  export interface ToastConfig {
    success?: (props: any) => React.ReactElement;
    error?: (props: any) => React.ReactElement;
    info?: (props: any) => React.ReactElement;
    [key: string]: ((props: any) => React.ReactElement) | undefined;
  }

  export default class Toast extends Component {
    static show(params: ToastShowParams): void;
    static hide(): void;
    static setRef(ref: any): void;
  }
}

