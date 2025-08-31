import React, {useState, useEffect, useMemo, memo, useCallback} from 'react';
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

// Мемоизируем тяжелые компоненты
const MemoizedSlider = memo(Slider);
const MemoizedImage = memo(Image);

const { width } = Dimensions.get('window');
const imageSize = width * 0.6;

const PlayerScreen: React.FC = () => {
    const route = useRoute<PlayerScreenRouteProp>();
    const { show } = route.params;
    const { state, playEpisode, togglePlayPause, seekTo, setShowDetails: setAudioShowDetails } = useAudio();
    const [showDetails, setShowDetails] = useState<ShowDetails | null>(null);
    const [loading, setLoading] = useState(true);// Мемоизация тяжелых вычислений
    const memoizedCurrentShow = useMemo(() => showDetails?.mainContent, [showDetails?.mainContent]);
    const memoizedCurrentEpisode = useMemo(() =>
        state.currentEpisode || showDetails?.episodeList?.[0],
        [state.currentEpisode, showDetails?.episodeList]
    );

    useEffect(() => {
        console.log(`${new Date()} - PlayerScreen useEffect begins`)
        // Используем setTimeout для разделения операций по фреймам
        const loadData = async () => {
            try {
                setLoading(true);

                // Сначала показываем базовый UI
                await new Promise(resolve => setTimeout(resolve, 50));

                await fetchShowDetails();
            } catch (error) {
                console.error('Ошибка загрузки:', error);
            }
        };

        loadData();
        console.log(`${new Date()} - PlayerScreen useEffect ends`)
    }, [show.id]);

    const fetchShowDetails = async () => {
        try {
            console.log(`${new Date()} - show.id = ${show.id}`)

            const response = await fetch(
                `https://services.err.ee/api/v2/radioAppContent/getContentPageData?contentId=${show.id}`
            );
            const jsonResponse = await response.json();

            // ВАЖНО: Сначала показываем UI данные
            setShowDetails(jsonResponse.data);
            setAudioShowDetails(jsonResponse.data);
            setLoading(false); // Убираем загрузку СРАЗУ после получения данных

            // Принудительно рендерим UI
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(resolve); // Двойной RAF для гарантии
                });
            });

            // Только ПОСЛЕ рендера UI запускаем аудио
            if (jsonResponse.data.episodeList && jsonResponse.data.episodeList.length > 0) {
                const playableEpisode = jsonResponse.data.episodeList.find(episode =>
                    (episode.medias && episode.medias.length > 0) ||
                    (episode.clips && episode.clips.length > 0)
                );

                if (playableEpisode) {
                    console.log(`${new Date()} - Найден воспроизводимый эпизод: ${playableEpisode.heading}`);

                    // Запускаем аудио в следующем тике
                    setTimeout(() => {
                        playEpisode(playableEpisode, jsonResponse.data).catch(error => {
                            console.error('Ошибка воспроизведения:', error);
                        });
                    }, 0);
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки деталей передачи:', error);
            setLoading(false);
        }
    };

    const formatTime = (milliseconds: number) => {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    /**
     * Преобразует timestamp (эпохи) в формат dd.MM.YYYY HH:mm
     * @param timestamp - время в миллисекундах или секундах с 1 января 1970 года
     * @returns отформатированная строка даты
     */
    const formatDateFromEpoch = (timestamp: number): string => {
        if (!timestamp || isNaN(timestamp)) {
            return 'Дата не указана';
        }

        // Если timestamp в секундах (меньше 13 цифр), конвертируем в миллисекунды
        const timestampMs = timestamp.toString().length <= 10
            ? timestamp * 1000
            : timestamp;

        try {
            const date = new Date(timestampMs);

            if (isNaN(date.getTime())) {
                return 'Некорректная дата';
            }

            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${day}.${month}.${year} ${hours}:${minutes}`;
        } catch (error) {
            console.error('Ошибка форматирования даты:', error);
            return 'Ошибка даты';
        }
    };

    const formatDate = (dateString: string) => {
        // Если это уже timestamp, используем новую функцию
        if (typeof dateString === 'number' || /^\d+$/.test(dateString)) {
            return formatDateFromEpoch(Number(dateString));
        }

        // Если это строка даты, используем старый метод
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleSeek = useMemo(() => {
        let seekTimeout: NodeJS.Timeout;
        return (value: number) => {
            // Дебаунсинг для перемотки
            clearTimeout(seekTimeout);
            seekTimeout = setTimeout(() => {
                seekTo(value);
            }, 100);
        };
    }, [seekTo]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0066cc" />
                <Text style={styles.loadingText}>Загрузка эпизода...</Text>
            </View>
        );
    }

    // Проверяем, есть ли данные о передаче
    if (!showDetails || !memoizedCurrentEpisode) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                    Ошибка загрузки данных о передаче
                </Text>
            </View>
        );
    }

    // Проверяем, есть ли список эпизодов и не пустой ли он
    if (!showDetails.episodeList || showDetails.episodeList.length === 0) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                    На данный момент эпизодов нет
                </Text>
            </View>
        );
    }

    // Проверяем, есть ли доступные для воспроизведения эпизоды
    const playableEpisodes = showDetails.episodeList.filter(episode =>
        (episode.medias && episode.medias.length > 0) ||
        (episode.clips && episode.clips.length > 0)
    );

    if (playableEpisodes.length === 0) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                    На данный момент эпизодов нет
                </Text>
            </View>
        );
    }

    // Проверка на ошибки аудио
    if (state.error) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{state.error}</Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                        // Повторная попытка загрузки эпизода
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
                    <Text style={styles.retryButtonText}>Повторить</Text>
                </TouchableOpacity>
            </View>
        );
    }

    /**
     * Декодирует Unicode escape последовательности (например, \u003C в <)
     */
    const decodeUnicodeEscapes = (str: string): string => {
        if (!str) return '';

        return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
            return String.fromCharCode(parseInt(code, 16));
        });
    };

    /**
     * Декодирует HTML entities (например, &lt; в <, &amp; в &)
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
     * Удаляет HTML теги и оставляет только текстовое содержимое
     */
    const stripHtmlTags = (str: string): string => {
        if (!str) return '';

        return str
        // Удаляем HTML теги, но сохраняем их содержимое
            .replace(/<[^>]+>/g, '')
            // Заменяем множественные пробелы на одинарные
            .replace(/\s+/g, ' ')
            // Убираем пробелы в начале и конце
            .trim();
    };

    /**
     * Полная очистка и декодирование HTML строки
     */
    const cleanHtmlText = (str: string): string => {
        if (!str || typeof str !== 'string') return '';

        // Шаг 1: Декодируем Unicode escape последовательности
        let cleaned = decodeUnicodeEscapes(str);

        // Шаг 2: Декодируем HTML entities
        cleaned = decodeHtmlEntities(cleaned);

        // Шаг 3: Удаляем HTML теги
        cleaned = stripHtmlTags(cleaned);

        return cleaned;
    };

    /**
     * Получает очищенное описание из объекта передачи
     */
    const getCleanDescription = (show: any): string | null => {
        if (!show) return null;

        const lead = show.lead ? cleanHtmlText(show.lead) : '';
        const body = show.body ? cleanHtmlText(show.body) : '';

        // Возвращаем lead, если он не пустой, иначе body
        const description = lead || body;

        return description && description.trim() !== '' ? description : null;
    };

    const currentShow = memoizedCurrentShow;
    const currentEpisode = memoizedCurrentEpisode;

    return (
        <ScrollView style={styles.container}>
            <View style={styles.playerContainer}>
                {/* Изображение эпизода */}
                <MemoizedImage
                    source={{ uri: currentShow?.rootContent?.squarePhotos?.length > 0 ? currentShow.rootContent.squarePhotos[0].photoTypes[4].url : currentEpisode?.photos?.[0]?.photoTypes?.[4]?.url }}
                    style={styles.episodeImage}
                    resizeMode="cover"
                />

                {/* Заголовок */}
                <Text style={styles.episodeHeading}>{currentEpisode.heading}</Text>

                {/* Прогресс-бар */}
                <View style={styles.progressContainer}>
                    <Text style={styles.timeText}>
                        {formatTime(state.currentTime)}
                    </Text>
                    <MemoizedSlider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={state.duration || 1} // Избегаем деления на 0
                        value={Math.min(state.currentTime, state.duration)} // Ограничиваем значение
                        onValueChange={handleSeek}
                        minimumTrackTintColor="#0066cc"
                        maximumTrackTintColor="#ccc"
                        thumbTintColor="#0066cc"
                        disabled={state.isLoading || !state.duration} // Отключаем если нет длительности
                    />
                    <Text style={styles.timeText}>
                        {formatTime(state.duration)}
                    </Text>
                </View>

                {/* Кнопка воспроизведения/паузы */}
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

                {/* Описание */}
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

                {/* Дата */}
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

export default memo(PlayerScreen);