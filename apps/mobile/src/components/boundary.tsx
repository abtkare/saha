import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { ErrorBox } from './ui';

/** خطأ في شاشة واحدة لا يوقف التطبيق كله: تظهر رسالة وزر «حاول مرة أخرى» */
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('شاشة تعطلت', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: 80 }}>
        <ErrorBox message="حدث خطأ في هذه الشاشة." onRetry={() => this.setState({ error: null })} />
      </View>
    );
  }
}
