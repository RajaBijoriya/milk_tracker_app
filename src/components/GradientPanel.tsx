import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {colors} from '../theme/colors';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function GradientPanel({children, style}: Props) {
  return (
    <View style={[styles.container, style]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="milkTrackerGradient" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.primary}/>
            <Stop offset="1" stopColor={colors.cyan}/>
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#milkTrackerGradient)"/>
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  content: {
    position: 'relative',
  },
});
