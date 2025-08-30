import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import { RootStackParamList } from '../../App';
import { ShowDetails, Episode } from '../types';
import { useAudio } from '../contexts/AudioContext';

type PlayerScreenRouteProp = RouteProp<RootStackParamList, 'Player'>;

const { width } = Dimensions.get('window');
const imageSize = width * 0.6;

const PlayerScreen: React.FC = () => {
    const route = useRoute<PlayerScreenRouteProp>();
    const { show } = route.params;
    const { state, playEpisode, togglePlayPause, seekTo, setShowDetails: setAudioShowDetails } = useAudio();
    const [showDetails, setShowDetails] = useState<ShowDetails | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchShowDetails();
    }, [show.id]);

    const fetchShowDetails = async () => {
        try {
            const response = await fetch(
                `https://services.err.ee/api/v2/radioAppContent/getContentPageData?contentId=${show.id}`
            );
            const jsonResponse = await response.json();
            setShowDetails(jsonResponse.data);
            setAudioShowDetails(jsonResponse.data);

            if (!jsonResponse.data.episodeList || jsonResponse.data.episodeList.length === 0) {
                console.log('List of episodes is empty');
                return;
            }
            const playableEpisode = jsonResponse.data.episodeList.find(episode =>
                (episode.medias && episode.medias.length > 0) ||
                (episode.clips && episode.clips.length > 0)
            );

            if (playableEpisode) {
                console.log('Found playing episode:', playableEpisode.heading);
                await playEpisode(playableEpisode, jsonResponse.data);
            } else {
                console.log('Playing episodes are not found');
            }

        } catch (error) {
            console.error('Error loading show\'s details:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (milliseconds: number) => {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    /**
     * Transform timestamp (epochs) to dd.MM.YYYY HH:mm format
     * @param timestamp - time in milliseconds or seconds starting from 1 january 1970 year
     * @returns formatted date string
     */
    const formatDateFromEpoch = (timestamp: number): string => {
        if (!timestamp || isNaN(timestamp)) {
            return 'Date is missing';
        }
        const timestampMs = timestamp.toString().length <= 10
            ? timestamp * 1000
            : timestamp;

        try {
            const date = new Date(timestampMs);

            if (isNaN(date.getTime())) {
                return 'Incorrect date';
            }

            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${day}.${month}.${year} ${hours}:${minutes}`;
        } catch (error) {
            console.error('Error date formatting:', error);
            return 'Date error';
        }
    };

    const formatDate = (dateString: string) => {
        if (typeof dateString === 'number' || /^\d+$/.test(dateString)) {
            return formatDateFromEpoch(Number(dateString));
        }
        const date = new Date(dateString);
        return date.toLocaleDateString('en-EN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleSeek = (value: number) => {
        seekTo(value);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0066cc" />
                <Text style={styles.loadingText}>Episode loading...</Text>
            </View>
        );
    }
    if (!showDetails) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                    Error loading show data
                </Text>
            </View>
        );
    }
    if (!showDetails.episodeList || showDetails.episodeList.length === 0) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                    There are currently no episodes
                </Text>
            </View>
        );
    }
    const playableEpisodes = showDetails.episodeList.filter(episode =>
        (episode.medias && episode.medias.length > 0) ||
        (episode.clips && episode.clips.length > 0)
    );

    if (playableEpisodes.length === 0) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                    There are currently no episodes
                </Text>
            </View>
        );
    }
    if (state.error) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{state.error}</Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                        if (showDetails && showDetails.episodeList && showDetails.episodeList.length > 0) {
                            const playableEpisode = showDetails.episodeList.find(episode =>
                                (episode.medias && episode.medias.length > 0) ||
                                (episode.clips && episode.clips.length > 0)
                            );
                            if (playableEpisode) {
                                playEpisode(playableEpisode, showDetails);
                            }
                        }
                    }}
                >
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    /**
     * Decodes Unicode escape sequence (ex., \u003C в <)
     */
    const decodeUnicodeEscapes = (str: string): string => {
        if (!str) return '';

        return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
            return String.fromCharCode(parseInt(code, 16));
        });
    };

    /**
     * Decodes HTML entities (ex., &lt; в <, &amp; в &)
     */
    const decodeHtmlEntities = (str: string): string => {
        if (!str) return '';

        const htmlEntities: { [key: string]: string } = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#039;': "'",
            '&#x27;': "'",
            '&apos;': "'",
            '&nbsp;': ' ',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™',
            '&hellip;': '...',
            '&mdash;': '—',
            '&ndash;': '–',
            '&laquo;': '«',
            '&raquo;': '»',
            '&bull;': '•'
        };

        return str.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
            return htmlEntities[entity] || entity;
        });
    };

    /**
     * Removes HTML tags and leaves only text content
     */
    const stripHtmlTags = (str: string): string => {
        if (!str) return '';

        return str
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    /**
     * Full purge and decoding of HTML string
     */
    const cleanHtmlText = (str: string): string => {
        if (!str || typeof str !== 'string') return '';
        let cleaned = decodeUnicodeEscapes(str);
        cleaned = decodeHtmlEntities(cleaned);
        cleaned = stripHtmlTags(cleaned);

        return cleaned;
    };

    /**
     * Receives purge content of show's object
     */
    const getCleanDescription = (show: any): string | null => {
        if (!show) return null;

        const lead = show.lead ? cleanHtmlText(show.lead) : '';
        const body = show.body ? cleanHtmlText(show.body) : '';
        const description = lead || body;

        return description && description.trim() !== '' ? description : null;
    };

    const currentShow = showDetails.mainContent
    const currentEpisode = state.currentEpisode || showDetails.episodeList[0];

    return (
        <ScrollView style={styles.container}>
            <View style={styles.playerContainer}>
                <Image
                    source={{ uri: currentShow.rootContent.squarePhotos.length > 0 ? currentShow.rootContent.squarePhotos[0].photoTypes[4].url : currentEpisode.photos[0].photoTypes[4].url }}
                    style={styles.episodeImage}
                    resizeMode="cover"
                />

                <Text style={styles.episodeHeading}>{currentEpisode.heading}</Text>

                <View style={styles.progressContainer}>
                    <Text style={styles.timeText}>
                        {formatTime(state.currentTime)}
                    </Text>
                    <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={state.duration}
                        value={state.currentTime}
                        onValueChange={handleSeek}
                        minimumTrackTintColor="#0066cc"
                        maximumTrackTintColor="#ccc"
                        thumbTintColor="#0066cc"
                    />
                    <Text style={styles.timeText}>
                        {formatTime(state.duration)}
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.playButton}
                    onPress={togglePlayPause}
                    disabled={state.isLoading}
                >
                    {state.isLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.playButtonText}>
                            {state.isPlaying ? '⏸️' : '▶️'}
                        </Text>
                    )}
                </TouchableOpacity>

                {(() => {
                    const description = getCleanDescription(currentShow);
                    return description ? (
                        <View style={styles.descriptionContainer}>
                            <Text style={styles.descriptionText}>
                                {description}
                            </Text>
                        </View>
                    ) : null;
                })()}

                <Text style={styles.dateText}>
                    {formatDate(currentEpisode.publicStart)}
                </Text>
            </View>
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
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 32,
    },
    errorText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
    },
    playerContainer: {
        flex: 1,
        alignItems: 'center',
        padding: 24,
    },
    episodeImage: {
        width: imageSize,
        height: imageSize,
        borderRadius: 12,
        marginBottom: 24,
    },
    episodeHeading: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        textAlign: 'center',
        marginBottom: 24,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        marginBottom: 24,
    },
    timeText: {
        fontSize: 14,
        color: '#666',
        minWidth: 50,
    },
    slider: {
        flex: 1,
        height: 40,
        marginHorizontal: 16,
    },
    playButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#0066cc',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    playButtonText: {
        fontSize: 32,
        color: '#fff',
    },
    descriptionContainer: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 8,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    descriptionText: {
        fontSize: 16,
        color: '#333',
        lineHeight: 24,
    },
    dateText: {
        fontSize: 14,
        color: '#666',
        fontStyle: 'italic',
    },
    retryButton: {
        backgroundColor: '#0066cc',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 16,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default PlayerScreen;