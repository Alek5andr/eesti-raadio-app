import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AudioProvider } from './src/contexts/AudioContext';
import HomeScreen from './src/screens/HomeScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import { Show } from './src/types';

export type RootStackParamList = {
    Home: undefined;
    Player: { show: Show };
};

const Stack = createStackNavigator<RootStackParamList>();

// Конфигурация уведомлений
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

export default function App() {
    useEffect(() => {
        // Запрос разрешений на уведомления
        const requestPermissions = async () => {
            const { status } = await Notifications.getPermissionsAsync();
            if (status !== 'granted') {
                await Notifications.requestPermissionsAsync();
            }
        };

        requestPermissions();
    }, []);

    return (
        <AudioProvider>
            <NavigationContainer>
                <Stack.Navigator
                    initialRouteName="Home"
                    screenOptions={{
                        headerStyle: {
                            backgroundColor: '#1a1a1a',
                        },
                        headerTintColor: '#fff',
                        headerTitleStyle: {
                            fontWeight: 'bold',
                        },
                    }}
                >
                    <Stack.Screen
                        name="Home"
                        component={HomeScreen}
                        options={{ title: 'Eesti Raadio' }}
                    />
                    <Stack.Screen
                        name="Player"
                        component={PlayerScreen}
                        options={{ title: 'Player' }}
                    />
                </Stack.Navigator>
                <StatusBar style="light" />
            </NavigationContainer>
        </AudioProvider>
    );
}