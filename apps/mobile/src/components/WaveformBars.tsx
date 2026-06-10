import { useEffect, useRef, useMemo } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  isPlaying: boolean
  barCount?: number
  height?: number
  color?: string
  secondaryColor?: string
}

export default function WaveformBars({
  isPlaying,
  barCount = 28,
  height = 56,
  color = '#ff6b35',
  secondaryColor = '#4e8cff',
}: Props) {
  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const bars = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, () => new Animated.Value(0.2)),
  ).current

  const animationsRef = useRef<Animated.CompositeAnimation[]>([])

  useEffect(() => {
    // Stop any running animations
    animationsRef.current.forEach((a) => a.stop())
    animationsRef.current = []

    if (!isPlaying) {
      // Settle all bars to a flat low position
      bars.forEach((bar) => {
        Animated.spring(bar, {
          toValue: 0.15,
          useNativeDriver: true,
          tension: 60,
          friction: 10,
        }).start()
      })
      return
    }

    // Staggered looping animations for each bar
    bars.forEach((bar, i) => {
      const minH = 0.1 + Math.random() * 0.1
      const maxH = 0.5 + Math.random() * 0.5
      const duration = 300 + Math.random() * 400

      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: maxH,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: minH,
            duration: duration,
            useNativeDriver: true,
          }),
        ]),
      )

      // Stagger start times so bars don't all move together
      setTimeout(() => {
        anim.start()
      }, i * 40)

      animationsRef.current.push(anim)
    })

    return () => {
      animationsRef.current.forEach((a) => a.stop())
      animationsRef.current = []
    }
  }, [isPlaying, bars])

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((bar, i) => {
        // Gradient: orange on left → blue on right
        const ratio = i / (barCount - 1)
        const r = Math.round(255 - ratio * (255 - 78))
        const g = Math.round(107 + ratio * (140 - 107))
        const b = Math.round(53 + ratio * (255 - 53))
        const barColor = `rgb(${r},${g},${b})`

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                backgroundColor: barColor,
                height: height,
                transform: [
                  {
                    scaleY: bar,
                  },
                ],
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: 'transparent',
  },
  bar: {
    flex: 1,
    borderRadius: 3,
    transformOrigin: 'bottom',
  },
})
