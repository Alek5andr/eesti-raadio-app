import AsyncStorage from '@react-native-async-storage/async-storage';
import { Episode } from '../types';

export interface PlaybackState {
  episode: Episode;
  position: number;
  timestamp: number;
  showDetails?: any; // Добавляем данные о передаче
}

export interface PlaybackHistory {
  [episodeId: string]: {
    episode: Episode;
    position: number;
    lastPlayed: number;
    showDetails?: any;
  };
}

export class StorageService {
  private static readonly LAST_PLAYED_KEY = 'lastPlayedEpisode';
  private static readonly PLAYBACK_POSITION_KEY = 'playbackPosition';
  private static readonly PLAYBACK_TIMESTAMP_KEY = 'playbackTimestamp';
  private static readonly PLAYBACK_HISTORY_KEY = 'playbackHistory';
  private static readonly SHOW_DETAILS_KEY = 'showDetails';

  // Сохранение текущего состояния воспроизведения
  static async savePlaybackState(episode: Episode, position: number, showDetails?: any): Promise<void> {
    try {
      const state: PlaybackState = {
        episode,
        position,
        timestamp: Date.now(),
        showDetails,
      };

      // Сохраняем основное состояние
      await AsyncStorage.multiSet([
        [this.LAST_PLAYED_KEY, JSON.stringify(episode)],
        [this.PLAYBACK_POSITION_KEY, position.toString()],
        [this.PLAYBACK_TIMESTAMP_KEY, Date.now().toString()],
        [this.SHOW_DETAILS_KEY, showDetails ? JSON.stringify(showDetails) : ''],
      ]);

      // Также сохраняем в историю для долгосрочного хранения
      await this.addToPlaybackHistory(episode, position, showDetails);

      console.log(`Состояние сохранено: эпизод ${episode.id}, позиция ${Math.floor(position / 1000)}с`);
    } catch (error) {
      console.error('Ошибка сохранения состояния воспроизведения:', error);
    }
  }

  // Получение текущего состояния воспроизведения
  static async getPlaybackState(): Promise<PlaybackState | null> {
    try {
      const [episodeData, positionData, timestampData, showDetailsData] = await AsyncStorage.multiGet([
        this.LAST_PLAYED_KEY,
        this.PLAYBACK_POSITION_KEY,
        this.PLAYBACK_TIMESTAMP_KEY,
        this.SHOW_DETAILS_KEY,
      ]);

      const episodeJson = episodeData[1];
      const positionString = positionData[1];
      const timestampString = timestampData[1];
      const showDetailsJson = showDetailsData[1];

      if (!episodeJson || !positionString || !timestampString) {
        return null;
      }

      const episode = JSON.parse(episodeJson);
      const position = parseFloat(positionString);
      const timestamp = parseInt(timestampString);
      const showDetails = showDetailsJson ? JSON.parse(showDetailsJson) : undefined;

      return {
        episode,
        position,
        timestamp,
        showDetails,
      };
    } catch (error) {
      console.error('Ошибка загрузки состояния воспроизведения:', error);
      return null;
    }
  }

  // Добавление в историю воспроизведения
  static async addToPlaybackHistory(episode: Episode, position: number, showDetails?: any): Promise<void> {
    try {
      const historyJson = await AsyncStorage.getItem(this.PLAYBACK_HISTORY_KEY);
      const history: PlaybackHistory = historyJson ? JSON.parse(historyJson) : {};

      history[episode.id] = {
        episode,
        position,
        lastPlayed: Date.now(),
        showDetails,
      };

      await AsyncStorage.setItem(this.PLAYBACK_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Ошибка добавления в историю воспроизведения:', error);
    }
  }

  // Получение позиции конкретного эпизода из истории
  static async getEpisodePosition(episodeId: string): Promise<{ position: number; showDetails?: any } | null> {
    try {
      const historyJson = await AsyncStorage.getItem(this.PLAYBACK_HISTORY_KEY);
      if (!historyJson) return null;

      const history: PlaybackHistory = JSON.parse(historyJson);
      const episodeData = history[episodeId];

      if (!episodeData) return null;

      return {
        position: episodeData.position,
        showDetails: episodeData.showDetails,
      };
    } catch (error) {
      console.error('Ошибка получения позиции эпизода:', error);
      return null;
    }
  }

  // Получение истории воспроизведения (последние N эпизодов)
  static async getPlaybackHistory(limit: number = 10): Promise<PlaybackHistory> {
    try {
      const historyJson = await AsyncStorage.getItem(this.PLAYBACK_HISTORY_KEY);
      if (!historyJson) return {};

      const history: PlaybackHistory = JSON.parse(historyJson);

      // Сортируем по времени последнего воспроизведения и берем последние N
      const sortedEntries = Object.entries(history)
          .sort(([,a], [,b]) => b.lastPlayed - a.lastPlayed)
          .slice(0, limit);

      return Object.fromEntries(sortedEntries);
    } catch (error) {
      console.error('Ошибка получения истории воспроизведения:', error);
      return {};
    }
  }

  // Очистка устаревших записей (старше N дней)
  static async cleanupOldPlaybackData(daysToKeep: number = 30): Promise<void> {
    try {
      const historyJson = await AsyncStorage.getItem(this.PLAYBACK_HISTORY_KEY);
      if (!historyJson) return;

      const history: PlaybackHistory = JSON.parse(historyJson);
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

      const cleanedHistory: PlaybackHistory = {};

      for (const [episodeId, data] of Object.entries(history)) {
        if (data.lastPlayed > cutoffTime) {
          cleanedHistory[episodeId] = data;
        }
      }

      await AsyncStorage.setItem(this.PLAYBACK_HISTORY_KEY, JSON.stringify(cleanedHistory));
      console.log('Старые данные воспроизведения очищены');
    } catch (error) {
      console.error('Ошибка очистки старых данных:', error);
    }
  }

  // Очистка текущего состояния (но не истории!)
  static async clearCurrentPlaybackState(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.LAST_PLAYED_KEY,
        this.PLAYBACK_POSITION_KEY,
        this.PLAYBACK_TIMESTAMP_KEY,
        this.SHOW_DETAILS_KEY,
      ]);
    } catch (error) {
      console.error('Ошибка очистки текущего состояния воспроизведения:', error);
    }
  }

  // Полная очистка всех данных воспроизведения
  static async clearAllPlaybackData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.LAST_PLAYED_KEY,
        this.PLAYBACK_POSITION_KEY,
        this.PLAYBACK_TIMESTAMP_KEY,
        this.SHOW_DETAILS_KEY,
        this.PLAYBACK_HISTORY_KEY,
      ]);
    } catch (error) {
      console.error('Ошибка полной очистки данных воспроизведения:', error);
    }
  }

  // Общие методы для сохранения состояния приложения
  static async saveAppState(key: string, value: any): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Ошибка сохранения состояния приложения (${key}):`, error);
    }
  }

  static async getAppState<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Ошибка загрузки состояния приложения (${key}):`, error);
      return null;
    }
  }

  // Проверка, есть ли сохраненные данные для конкретного эпизода
  static async hasEpisodeData(episodeId: string): Promise<boolean> {
    try {
      const position = await this.getEpisodePosition(episodeId);
      return position !== null && position.position > 0;
    } catch (error) {
      console.error('Ошибка проверки данных эпизода:', error);
      return false;
    }
  }
}