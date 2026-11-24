import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
} from 'react-native';

type Props = ScrollViewProps & {
  keyboardVerticalOffset?: number;
};

export default function FormScrollView({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  keyboardShouldPersistTaps = 'handled',
  ...scrollViewProps
}: Props) {
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}>
      <ScrollView
        {...scrollViewProps}
        style={[styles.scroll, style]}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  scroll: {flex: 1},
  content: {flexGrow: 1},
});
