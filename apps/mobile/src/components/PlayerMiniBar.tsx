import { StyleSheet, Text, TouchableOpacity, View, Animated, Pressable } from 'react-native'
import { useRef, useMemo } from 'react'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { useSessionStore } from '../store/sessionStore'
import { formatTime } from '../lib/formatters'
import { useAppTheme } from '../hooks/useAppTheme'
import type { AppThemeColors } from '../theme/theme'

type Props = {
  onPress?: () => void
}

export default function PlayerMiniBar({ onPress }: Props) {
  const {
    hostRunning,
    guestConnected,
    hostPlaying,
    selectedTrack,
    hostPositionMs,
    hostDurationMs,
    guestTrackName,
    guestPositionMs,
    guestDurationMs,
    playHost,
    pauseHost,
    setActiveTab,
  } = useSessionStore()

  const isHost = hostRunning
  const isGuest = guestConnected && !hostRunning

  const themeColors = useAppTheme()
  const styles = useMemo(() => createStyles(themeColors), [themeColors])

  const scaleAnim = useRef(new Animated.Value(1)).current
  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.85, useNativeDriver: true }).start()
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()

  const title = isHost
    ? (selectedTrack?.title ?? 'No track selected')
    : isGuest
    ? (guestTrackName || 'Waiting for host…')
    : ''

  const positionMs = isHost ? hostPositionMs : guestPositionMs
  const durationMs = isHost ? hostDurationMs : guestDurationMs
  const progress = durationMs > 0 ? (positionMs / durationMs) * 100 : 0

  if (!isHost && !isGuest) return null

  return (
    <Pressable
      style={({ pressed }) => [styles.barWrapper, pressed && { opacity: 0.9 }]}
      onPress={() => setActiveTab('player')}
    >
      <BlurView intensity={70} tint={themeColors.blurTint} style={styles.barBlur}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Progress line */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Track artwork icon */}
          <LinearGradient 
            colors={isGuest ? [themeColors.accentDim, 'transparent'] : [themeColors.primaryDim, 'transparent']}
            style={[styles.artwork, isGuest && styles.artworkGuest]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Feather name={isGuest ? "headphones" : "music"} size={20} color={isGuest ? themeColors.accent : themeColors.primary} />
          </LinearGradient>

          {/* Track info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.time}>
            {formatTime(positionMs)} / {formatTime(durationMs)}
          </Text>
        </View>

        {/* Play/Pause — host only */}
        {isHost && (
          <Pressable
            onPress={() => void (hostPlaying ? pauseHost() : playHost())}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View style={[styles.playBtnContainer, { transform: [{ scale: scaleAnim }] }]}>
              <LinearGradient
                colors={['#ff8c5a', '#ff6b35']}
                style={styles.playBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Feather name={hostPlaying ? "pause" : "play"} size={18} color="#fff" style={{ marginLeft: hostPlaying ? 0 : 2 }} />
              </LinearGradient>
            </Animated.View>
          </Pressable>
        )}

        {/* Guest: listening indicator */}
        {isGuest && (
          <View style={styles.listeningDot} />
        )}
      </View>
      </BlurView>
    </Pressable>
  )
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  barWrapper: {
    backgroundColor: theme.background === '#06111f' ? 'rgba(8, 15, 28, 0.6)' : 'rgba(248, 250, 252, 0.7)',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 10,
  },
  barBlur: {
    width: '100%',
  },
  progressTrack: {
    height: 2,
    backgroundColor: theme.cardBorder,
  },
  progressFill: {
    height: 2,
    backgroundColor: theme.primary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.primaryDim,
    borderWidth: 1,
    borderColor: theme.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  artworkGuest: {
    backgroundColor: theme.accentDim,
    borderColor: theme.accentDim,
  },
  artworkIcon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  time: {
    color: theme.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  playBtnContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    shadowColor: theme.primary,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 15,
    color: '#fff',
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.accent,
    opacity: 0.9,
  },
})
