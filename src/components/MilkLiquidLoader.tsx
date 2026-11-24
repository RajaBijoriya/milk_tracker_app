import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {colors} from '../theme/colors';

type Props = {
  size?: number;
  color?: string;
  backgroundColor?: string;
  showText?: boolean;
  fullScreen?: boolean;
};

const AnimatedView = Animated.View;
const PARTICLE_COUNT = 8;
const ROTATION_DURATION = 5000;

export default function MilkLiquidLoader({
  size,
  color,
  backgroundColor,
  showText = true,
  fullScreen = false,
}: Props) {
  const {width} = useWindowDimensions();
  const loaderSize = size ?? Math.min(240, Math.max(112, width * 0.56));
  const particleColor = color ?? (fullScreen ? colors.white : colors.primary);
  const rotation = useRef(new Animated.Value(0)).current;
  const particleScales = useRef(
    Array.from({length: PARTICLE_COUNT}, () => new Animated.Value(0.82)),
  ).current;
  const particleOpacities = useRef(
    Array.from({length: PARTICLE_COUNT}, () => new Animated.Value(0.82)),
  ).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];
    if (!reduceMotion) {
      animations.push(
        Animated.loop(
          Animated.timing(rotation, {
            toValue: 1,
            duration: ROTATION_DURATION,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      );
      particleScales.forEach((scale, index) => {
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.delay(index * 70),
              Animated.parallel([
                Animated.timing(scale, {
                  toValue: 1.4,
                  duration: 300,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
                Animated.timing(particleOpacities[index], {
                  toValue: 1,
                  duration: 300,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
              ]),
              Animated.parallel([
                Animated.timing(scale, {
                  toValue: 0.72,
                  duration: 360,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
                Animated.timing(particleOpacities[index], {
                  toValue: 0.6,
                  duration: 360,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
              ]),
              Animated.parallel([
                Animated.timing(scale, {
                  toValue: 0.82,
                  duration: 340,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
                Animated.timing(particleOpacities[index], {
                  toValue: 0.82,
                  duration: 340,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
              ]),
            ]),
          ),
        );
      });
      animations.forEach(animation => animation.start());
    }

    return () => animations.forEach(animation => animation.stop());
  }, [particleOpacities, particleScales, reduceMotion, rotation]);

  const ringSize = loaderSize * 0.72;
  const particleSize = loaderSize * 0.105;
  const radius = ringSize * 0.25;
  const particles = useMemo(
    () =>
      Array.from({length: PARTICLE_COUNT}, (_, index) => {
        const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
        return {
          left: ringSize / 2 + Math.cos(angle) * radius - particleSize / 2,
          top: ringSize / 2 + Math.sin(angle) * radius - particleSize / 2,
        };
      }),
    [particleSize, radius, ringSize],
  );
  const particleOpacityStyles = useMemo(
    () => particleOpacities.map(opacity => ({opacity})),
    [particleOpacities],
  );
  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="MilkTracker is loading"
      style={[
        styles.container,
        fullScreen
          ? styles.fullScreen
          : {
              width: loaderSize,
              height: loaderSize,
              borderRadius: loaderSize * 0.18,
            },
      ]}>
      {fullScreen ? (
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%">
          <Defs>
            <LinearGradient id="milkLoaderGradient" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={backgroundColor ?? colors.primary}/>
              <Stop offset="1" stopColor={colors.cyan}/>
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#milkLoaderGradient)"/>
        </Svg>
      ) : backgroundColor ? (
        <View style={[StyleSheet.absoluteFill, {backgroundColor}]}/>
      ) : null}
      <View style={[styles.loader, {width: loaderSize, height: loaderSize}]}>
        <AnimatedView
          style={[
            styles.orbit,
            {
              width: ringSize,
              height: ringSize,
              top: (loaderSize - ringSize) / 2,
              left: (loaderSize - ringSize) / 2,
              transform: [{rotate: reduceMotion ? '0deg' : spin}],
            },
          ]}>
          {particles.map((position, index) => (
            <AnimatedView
              key={index}
              style={[
                styles.particle,
                {
                  left: position.left,
                  top: position.top,
                  width: particleSize,
                  height: particleSize,
                  borderRadius: particleSize / 2,
                  backgroundColor: particleColor,
                  transform: [{scale: reduceMotion ? 1 : particleScales[index]}],
                },
                reduceMotion ? styles.visibleParticle : particleOpacityStyles[index],
              ]}
            />
          ))}
        </AnimatedView>
        {showText ? <Text style={styles.label}>Milk</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  fullScreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  loader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbit: {
    position: 'absolute',
  },
  particle: {
    position: 'absolute',
  },
  visibleParticle: {
    opacity: 1,
  },
  label: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
