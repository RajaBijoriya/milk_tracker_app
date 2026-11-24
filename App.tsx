import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PaperProvider} from 'react-native-paper';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons/static';
import AppNavigator from './src/navigation/AppNavigator';
import {paperTheme} from './src/theme/paperTheme';

type PaperProviderSettings = NonNullable<React.ComponentProps<typeof PaperProvider>['settings']>;
type PaperIconProps = Parameters<NonNullable<PaperProviderSettings['icon']>>[0];

const renderPaperIcon = ({name, color, size, direction, testID}: PaperIconProps) => (
  <MaterialDesignIcons
    name={name}
    color={color}
    size={size}
    style={{transform: [{scaleX: direction === 'rtl' ? -1 : 1}]}}
    testID={testID}
  />
);

function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}
        settings={{
          icon: renderPaperIcon,
        }}>
        <StatusBar barStyle="dark-content"/>
        <AppNavigator/>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

export default App;
