import { MANUFACTURER_CONFIGS } from "@/config/manufacturerConfig";
import type { ManufacturerConfig, ManufacturerType } from "@/types/manufacturer";

export default class ManufacturerManager {
  /**
   * 获取厂商配置
   */
  static getConfig(manufacturer: ManufacturerType): ManufacturerConfig | null {
    return MANUFACTURER_CONFIGS[manufacturer] || null;
  }

  /**
   * 验证图片数量
   */
  static validateImageCount(manufacturer: ManufacturerType, count: number): boolean {
    const config = this.getConfig(manufacturer);
    return config ? config.validateImages(count) : false;
  }

  /**
   * 验证时长
   */
  static validateDuration(manufacturer: ManufacturerType, duration: number): boolean {
    const config = this.getConfig(manufacturer);
    return config ? config.validateDuration(duration) : false;
  }

  /**
   * 获取默认配置
   */
  static getDefaults(manufacturer: ManufacturerType) {
    const config = this.getConfig(manufacturer);
    if (!config) return null;

    return {
      duration: config.defaultDuration,
      resolution: config.defaultResolution,
      ratio: config.defaultRatio,
    };
  }

  /**
   * 获取最大图片数
   */
  static getMaxImages(manufacturer: ManufacturerType): number {
    const config = this.getConfig(manufacturer);
    return config?.maxImages ?? 9;
  }

  /**
   * 是否需要宽高比
   */
  static requiresRatio(manufacturer: ManufacturerType): boolean {
    const config = this.getConfig(manufacturer);
    return config?.requiresRatio ?? false;
  }

  /**
   * 是否必须提示词
   */
  static requiresPrompt(manufacturer: ManufacturerType): boolean {
    const config = this.getConfig(manufacturer);
    return config?.requiresPrompt ?? false;
  }
}
