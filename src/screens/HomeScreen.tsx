import React, { useState, useEffect } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { Show, Category } from '../types';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

const { width } = Dimensions.get('window');
const itemWidth = width * 0.4;

const HomeScreen: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const navigation = useNavigation<HomeScreenNavigationProp>();

    useEffect(() => {
        fetchShows();
    }, []);

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

    const renderShow = (show: Show) => {
        // теперь renderShow использует обычный return вместо стрелочной функции с немедленным возвратом

        // Безопасный доступ к изображению
        const imageUrl = show.photos?.[0]?.photoTypes?.[36]?.url;
        /*if (imageUrl) {
            console.log('Image URL:', imageUrl);
        }*/

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
        )
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