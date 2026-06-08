import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

type Props = {
  title: string
  subtitle?: string
  rightSlot?: ReactNode
  children: ReactNode
}

export default function SectionCard({ title, subtitle, rightSlot, children }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {rightSlot ? <View>{rightSlot}</View> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: 'rgba(8, 15, 28, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(122, 173, 255, 0.18)',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: '#f7fbff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(213, 226, 244, 0.7)',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    gap: 12,
  },
})
