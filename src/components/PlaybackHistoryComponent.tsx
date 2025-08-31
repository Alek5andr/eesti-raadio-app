import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { StorageService, PlaybackHistory } from '../services/StorageService';
import { Episode } from '../types';

type NavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

const { width } = Dimensions.get('window');
const itemWidth = width * 0.4;

interface PlaybackHistoryComponentProps {
    onEpisodePress: (episode: Episode, showDetails?: any) => void;
}

const PlaybackHistoryComponent: React.FC<PlaybackHistoryComponentProps> = ({ onEpisodePress }) => {
    const [history, setHistory] = useState<PlaybackHistory>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log('PlaybackHistory useEffect begins')
        loadHistory();
        console.log('PlaybackHistory useEffect ends')
    }, []);

    const loadHistory = async () => {
        try {
            const playbackHistory = await StorageService.getPlaybackHistory(5);            setHistory(playbackHistory);
        } catch (error) {
            console.error('Error loading playback history:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (milliseconds: number) => {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - timestamp;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} дн. назад`;
        } else {
            return date.toLocaleDateString('en-EN', {
                day: '2-digit',
                month: '2-digit',
            });
        }
    };

    const getEpisodeImage = (episode: Episode, showDetails?: any) => {
        try {
            if (showDetails?.mainContent?.rootContent?.squarePhotos?.length > 0) {
                return showDetails.mainContent.rootContent.squarePhotos[0].photoTypes[4]?.url;
            } else if (episode.photos && episode.photos.length > 0) {
                return episode.photos[0].photoTypes[36]?.url || episode.photos[0].photoTypes[4]?.url;
            }
            return null;
        } catch (error) {
            console.error('Error getting episode image:', error);
            return null;
        }
    };

    const renderHistoryItem = (episodeId: string, data: any) => {
        const { episode, position, lastPlayed, showDetails } = data;
        const imageUrl = getEpisodeImage(episode, showDetails);
        const progressPercent = episode.duration ? (position / episode.duration) * 100 : 0;

        return (
            <TouchableOpacity
                key={episodeId}
                style={styles.historyItem}
                onPress={() => onEpisodePress(episode, showDetails)}
            >
                <View style={styles.imageContainer}>
                    <Image
                        source={{ uri: imageUrl || 'fallback-image-url' }}
                        style={styles.episodeImage}
                        resizeMode="cover"
                    />
                    {/* Прогресс-бар */}
                    <View style={styles.progressBarContainer}>
                        <View 
                            style={[
                                styles.progressBar, 
                                { width: `${Math.min(progressPercent, 100)}%` }
                            ]} 
                        />
                    </View>
                </View>
                
                <Text style={styles.episodeTitle} numberOfLines={2}>
                    {episode.heading || episode.title}
                </Text>
                
                <View style={styles.episodeInfo}>
                    <Text style={styles.timeInfo}>
                        {formatTime(position)}
                    </Text>
                    <Text style={styles.dateInfo}>
                        {formatDate(lastPlayed)}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const historyEntries = Object.entries(history);

    if (loading) {
        return null;    }

    if (historyEntries.length === 0) {
        return null;    }

    return (
        <View style={styles.container}>
            <Text style={styles.sectionHeader}>Недавно слушали</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContainer}
            >
                {historyEntries.map(([episodeId, data]) => 
                    renderHistoryItem(episodeId, data)
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 16,
    },
    sectionHeader: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
        marginHorizontal: 16,
        color: '#333',
    },
    scrollContainer: {
        paddingHorizontal: 16,
    },
    historyItem: {
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
    imageContainer: {
        position: 'relative',
        marginBottom: 8,
    },
    episodeImage: {
        width: '100%',
        height: itemWidth - 24,
        borderRadius: 8,
    },
    progressBarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#0066cc',
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
    },
    episodeTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
        textAlign: 'center',
        minHeight: 36,
        marginBottom: 8,
    },
    episodeInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    timeInfo: {
        fontSize: 12,
        color: '#0066cc',
        fontWeight: '600',
    },
    dateInfo: {
        fontSize: 12,
        color: '#666',
    },
});

export default PlaybackHistoryComponent;