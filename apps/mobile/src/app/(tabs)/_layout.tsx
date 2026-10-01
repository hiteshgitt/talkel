import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { IconName } from '@/lib/visuals';
import { useColors } from '@/theme';

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName; hidden?: boolean }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'missions', title: 'Missions', icon: 'flag-outline', iconActive: 'flag' },
  { name: 'practice', title: 'Practice', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'history', title: 'History', icon: 'time-outline', iconActive: 'time' },
  { name: 'progress', title: 'Progress', icon: 'trending-up-outline', iconActive: 'trending-up' },
  // Opened from the avatar on Home, to keep the tab bar to five items.
  { name: 'profile', title: 'Profile', icon: 'person-circle-outline', iconActive: 'person-circle', hidden: true },
];

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            ...(t.hidden ? { href: null } : {}),
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? t.iconActive : t.icon} color={color} size={24} />,
          }}
        />
      ))}
    </Tabs>
  );
}
