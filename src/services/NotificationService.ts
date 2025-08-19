import * as Notifications from 'expo-notifications';
import { Episode } from '../types';

export class NotificationService {
  private static instance: NotificationService;
  private currentNotificationId: string | null = null;

  // Фиксированный ID для всех уведомлений плеера
  private static readonly PLAYER_NOTIFICATION_ID = 'player_notification';

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async setupNotifications(): Promise<boolean> {
    try {
      // Запрос разрешений
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus !== 'granted') {
          console.warn('Разрешения на уведомления не предоставлены');
          return false;
        }
      }

      // Настройка обработчика уведомлений
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });

      // Создаем категорию уведомлений с действиями
      await Notifications.setNotificationCategoryAsync('PLAYER_CONTROLS', [
        {
          identifier: 'PLAY_PAUSE',
          buttonTitle: 'Play/Pause',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'OPEN_APP',
          buttonTitle: 'Open',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);

      // Очищаем только при инициализации
      await this.clearAllNotifications();

      return true;
    } catch (error) {
      console.error('Ошибка настройки уведомлений:', error);
      return false;
    }
  }

  // Метод для получения URL изображения из эпизода
  private getEpisodeImageUrl(episode: Episode): string | null {
    try {
      // Используем указанный путь: episode.photos.photoTypes[4].url
      if (episode.photos && episode.photos.length > 0) {
        const photo = episode.photos[0];
        if (photo.photoTypes && photo.photoTypes[4] && photo.photoTypes[4].url) {
          return photo.photoTypes[4].url;
        }

        // TODO Possibly to give an error due to weird numbering from JSON
        // Fallback - пробуем другие размеры если 4 недоступен
        if (photo.photoTypes) {
          // Пробуем найти любой доступный размер
          const availableTypes = Object.keys(photo.photoTypes);
          if (availableTypes.length > 0) {
            const firstAvailable = availableTypes[0];
            return photo.photoTypes[firstAvailable]?.url || null;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Ошибка получения URL изображения эпизода:', error);
      return null;
    }
  }

  // Метод для очистки всех уведомлений
  async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('Ошибка очистки уведомлений:', error);
    }
  }

  // Метод для принудительной очистки при смене эпизода
  async clearBeforeNewEpisode(): Promise<void> {
    try {
      // Очищаем только если есть текущее уведомление
      if (this.currentNotificationId) {
        await Notifications.dismissNotificationAsync(this.currentNotificationId);
        this.currentNotificationId = null;
      }

      // Дополнительно очищаем по фиксированному ID
      try {
        await Notifications.dismissNotificationAsync(NotificationService.PLAYER_NOTIFICATION_ID);
      } catch (error) {
        // Игнорируем ошибку если уведомление не найдено
      }
    } catch (error) {
      console.error('Ошибка очистки перед новым эпизодом:', error);
    }
  }

  async showPlayerNotification(
      episode: Episode,
      isPlaying: boolean,
      currentTime: number,
      duration: number,
      fallbackImageUrl?: string
  ): Promise<string | null> {
    try {
      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

      const content: Notifications.NotificationContent = {
        title: episode.heading || episode.title || 'Радио эпизод',
        body: `${isPlaying ? '▶️ Воспроизводится' : '⏸️ Приостановлено'} • ${this.formatTime(currentTime)} / ${this.formatTime(duration)}`,
        data: {
          episodeId: episode.id,
          action: 'player_control',
          progress: progress,
          isPlaying: isPlaying,
        },
        sticky: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sound: false,
        categoryIdentifier: 'PLAYER_CONTROLS',
      };

      // Пытаемся получить изображение из эпизода
      const episodeImageUrl = this.getEpisodeImageUrl(episode);
      const imageUrl = episodeImageUrl || fallbackImageUrl;

      // Добавляем изображение, если URL найден
      if (imageUrl) {
        try {
          console.log('Добавляем изображение в уведомление:', imageUrl);
          content.attachments = [
            {
              url: imageUrl,
              options: {
                typeHint: 'public.jpeg',
              },
            },
          ];
        } catch (error) {
          console.error('Ошибка добавления изображения к уведомлению:', error);
          // Продолжаем без изображения
        }
      }

      // Используем фиксированный ID без предварительной очистки
      // Android автоматически заменит предыдущее уведомление с тем же ID
      const notificationId = await Notifications.scheduleNotificationAsync({
        identifier: NotificationService.PLAYER_NOTIFICATION_ID, // Фиксированный ID
        content,
        trigger: null,
      });

      this.currentNotificationId = notificationId;
      return notificationId;
    } catch (error) {
      console.error('Ошибка создания уведомления:', error);
      return null;
    }
  }

  async hidePlayerNotification(): Promise<void> {
    try {
      // Удаляем по фиксированному ID
      await Notifications.dismissNotificationAsync(NotificationService.PLAYER_NOTIFICATION_ID);
      this.currentNotificationId = null;
    } catch (error) {
      console.error('Ошибка скрытия уведомления:', error);
    }
  }

  private formatTime(milliseconds: number): string {
    try {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor((milliseconds % 60000) / 1000);
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } catch (error) {
      console.error('Ошибка форматирования времени:', error);
      return '00:00';
    }
  }

  // Обработка нажатий на уведомления
  setupNotificationListeners(
      onNotificationPress: (data: any) => void,
      onPlayPausePress: () => void
  ): () => void {
    try {
      // Обработка нажатий на уведомления когда приложение активно
      const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
        // Можно добавить логику для обработки получения уведомлений
      });

      // Обработка нажатий на уведомления и действий
      const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        try {
          const { data } = response.notification.request.content;
          const actionIdentifier = response.actionIdentifier;

          if (actionIdentifier === 'PLAY_PAUSE') {
            // Обработка нажатия на кнопку Play/Pause
            onPlayPausePress();
          } else {
            // Обработка обычного нажатия на уведомление
            onNotificationPress(data);
          }
        } catch (error) {
          console.error('Ошибка обработки нажатия на уведомление:', error);
        }
      });

      return () => {
        try {
          foregroundSubscription.remove();
          responseSubscription.remove();
        } catch (error) {
          console.error('Ошибка удаления слушателей уведомлений:', error);
        }
      };
    } catch (error) {
      console.error('Ошибка настройки слушателей уведомлений:', error);
      // Возвращаем пустую функцию очистки
      return () => {};
    }
  }
}