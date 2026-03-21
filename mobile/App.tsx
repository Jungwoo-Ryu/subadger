import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme, Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "./src/theme";
import { AuthProvider } from "./src/context/AuthContext";
import { SplashScreen } from "./src/screens/SplashScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { MatchingScreen } from "./src/screens/MatchingScreen";
import { ListScreen } from "./src/screens/ListScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import type { RootStackParamList } from "./src/navigation/types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.border,
    primary: colors.primary,
  },
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Map: "map-outline",
            Swipe: "heart-outline",
            List: "list-outline",
            Chat: "chatbubble-outline",
            Profile: "person-outline",
          };
          const name = map[route.name] ?? "ellipse";
          return <Ionicons name={name} size={size - 2} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Map" component={MapScreen} options={{ title: "Map" }} />
      <Tabs.Screen name="Swipe" component={MatchingScreen} options={{ title: "Match" }} />
      <Tabs.Screen name="List" component={ListScreen} options={{ title: "List" }} />
      <Tabs.Screen name="Chat" component={MessagesScreen} options={{ title: "Chat" }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{ headerShown: false, animation: "fade" }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Main" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
