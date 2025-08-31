import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { Show, Category, Episode } from '../types';
import { useAudio } from '../contexts/AudioContext';
import PlaybackHistoryComponent from '../components/PlaybackHistoryComponent';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

const { width } = Dimensions.get('window');
const itemWidth = width * 0.4;

const HomeScreen: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [historyKey, setHistoryKey] = useState(0); // Для принудительного обновления истории
    const navigation = useNavigation<HomeScreenNavigationProp>();
    const { playEpisode } = useAudio();

    useEffect(() => {
        console.log('HomeScreen useEffect begins')
        fetchShows();
        console.log('HomeScreen useEffect ends')
    }, []);

    // Обновляем историю при фокусе на экран
    useFocusEffect(
        useCallback(() => {
            setHistoryKey(prev => prev + 1); // Принудительно обновляем компонент истории
        }, [])
    );

    const fetchShows = async () => {
        try {
            const response = await fetch(
                'https://services.err.ee/api/v2/radio/getByUrl?domain=eesti-raadio.err.ee&url=app'
            );
            const jsonResponse = await response.json();

            // Группировка передач по категориям
            const groupedData: Category[] = jsonResponse.data.category.frontPage || [];

            setCategories(groupedData);
        } catch (error) {
            console.error('Ошибка загрузки передач:', error);
        } finally {
            setLoading(false);
        }
    };

    const navigateToPlayer = (show: Show) => {
        navigation.navigate('Player', { show });
    };

    // Обработчик нажатия на эпизод из истории
    const handleHistoryEpisodePress = async (episode: Episode, showDetails?: any) => {
        try {
            if (showDetails) {
                // Если есть сохраненные данные о передаче, используем их
                await playEpisode(episode, showDetails);
            } else {
                // Если нет данных о передаче, пытаемся их получить
                console.warn('Нет данных о передаче для эпизода:', episode.heading);
                // Здесь можно было бы попытаться найти передачу по ID эпизода,
                // но это потребует дополнительных API вызовов
            }
        } catch (error) {
            console.error('Ошибка воспроизведения эпизода из истории:', error);
        }
    };

    const renderShow = (show: Show) => {
        // Безопасный доступ к изображению
        const imageUrl = show.photos?.[0]?.photoTypes?.[36]?.url;

        return (
            <TouchableOpacity
                key={show.id}
                style={styles.showItem}
                onPress={() => navigateToPlayer(show)}
            >
                <Image
                    source={{ uri: imageUrl || 'fallback-image-url' }}
                    style={styles.showImage}
                    resizeMode="cover"
                />
                <Text style={styles.showTitle} numberOfLines={2}>
                    {show.heading}
                </Text>
            </TouchableOpacity>
        );
    };

    const renderCategory = (category: Category) => (
        <View key={category.header} style={styles.categoryContainer}>
            <Text style={styles.categoryHeader}>{category.header}</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollContainer}
            >
                {Array.isArray(category.data) ? category.data.map(renderShow) : null}
            </ScrollView>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0066cc" />
                <Text style={styles.loadingText}>Загрузка передач...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            {/* Компонент истории воспроизведения */}
            <PlaybackHistoryComponent
                key={historyKey}
                onEpisodePress={handleHistoryEpisodePress}
            />

            {/* Категории передач */}
            {categories.map(renderCategory)}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    categoryContainer: {
        marginVertical: 16,
    },
    categoryHeader: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
        marginHorizontal: 16,
        color: '#333',
    },
    categoryScrollContainer: {
        paddingHorizontal: 16,
    },
    showItem: {
        width: itemWidth,
        marginRight: 16,
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    showImage: {
        width: '100%',
        height: itemWidth - 24,
        borderRadius: 8,
        marginBottom: 8,
    },
    showTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        textAlign: 'center',
        minHeight: 36,
    },
});

export default HomeScreen;