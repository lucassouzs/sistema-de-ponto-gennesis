export interface LocationValidation {
  isValid: boolean;
  reason: string;
  distance?: number;
}

export interface Location {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // em metros
}

export class LocationService {
  /**
   * Calcula a distância entre dois pontos usando a fórmula de Haversine
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Raio da Terra em metros
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distância em metros
    
    return distance;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Valida se a localização está dentro dos locais permitidos
   */
  async validateLocation(
    latitude: number,
    longitude: number,
    allowedLocations: Location[]
  ): Promise<LocationValidation> {
    // Modo desenvolvimento: pular validação
    if ((process.env.SKIP_LOCATION_VALIDATION || '').toLowerCase() === 'true') {
      return {
        isValid: true,
        reason: 'Validação de localização desativada (dev)',
        distance: 0
      };
    }

    const expandedRadius = parseInt(process.env.DEV_LOCATION_RADIUS_METERS || '0') || 0;

    // Se não há locais permitidos, usar localização padrão da empresa
    if (!allowedLocations || allowedLocations.length === 0) {
      return this.validateWithDefaultLocation(latitude, longitude, expandedRadius);
    }

    // Verificar se está dentro de algum local permitido (com possível expansão de raio em dev)
    for (const location of allowedLocations) {
      const distance = this.calculateDistance(
        latitude,
        longitude,
        location.latitude,
        location.longitude
      );

      const effectiveRadius = Math.max(location.radius, expandedRadius);

      if (distance <= effectiveRadius) {
        return {
          isValid: true,
          reason: `Localização válida - dentro de ${location.name}`,
          distance: Math.round(distance)
        };
      }
    }

    // Se não está em nenhum local permitido
    const nearestLocation = allowedLocations.reduce((nearest, current) => {
      const nearestDistance = this.calculateDistance(
        latitude,
        longitude,
        nearest.latitude,
        nearest.longitude
      );
      const currentDistance = this.calculateDistance(
        latitude,
        longitude,
        current.latitude,
        current.longitude
      );
      
      return currentDistance < nearestDistance ? current : nearest;
    });

    const distanceToNearest = this.calculateDistance(
      latitude,
      longitude,
      nearestLocation.latitude,
      nearestLocation.longitude
    );

    return {
      isValid: false,
      reason: `Localização inválida - ${Math.round(distanceToNearest)}m de distância do local mais próximo (${nearestLocation.name}). Máximo permitido: ${nearestLocation.radius}m`,
      distance: Math.round(distanceToNearest)
    };
  }

  /**
   * Valida com a localização padrão da empresa
   */
  private async validateWithDefaultLocation(
    latitude: number,
    longitude: number,
    expandedRadius: number = 0
  ): Promise<LocationValidation> {
    const defaultLatitude = parseFloat(process.env.DEFAULT_LATITUDE || '-23.5505');
    const defaultLongitude = parseFloat(process.env.DEFAULT_LONGITUDE || '-46.6333');
    const maxDistanceBase = parseInt(process.env.MAX_DISTANCE_METERS || '1000');
    const maxDistance = Math.max(maxDistanceBase, expandedRadius || 0);

    const distance = this.calculateDistance(
      latitude,
      longitude,
      defaultLatitude,
      defaultLongitude
    );

    if (distance <= maxDistance) {
      return {
        isValid: true,
        reason: 'Localização válida - dentro da área da empresa',
        distance: Math.round(distance)
      };
    }

    return {
      isValid: false,
      reason: `Localização inválida - ${Math.round(distance)}m de distância da empresa. Máximo permitido: ${maxDistance}m`,
      distance: Math.round(distance)
    };
  }

  /**
   * Verifica se a localização é válida (coordenadas válidas)
   */
  isValidCoordinates(latitude: number, longitude: number): boolean {
    return (
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180 &&
      !isNaN(latitude) &&
      !isNaN(longitude)
    );
  }

  /**
   * Formata a localização para exibição
   */
  formatLocation(latitude: number, longitude: number): string {
    const latDir = latitude >= 0 ? 'N' : 'S';
    const lonDir = longitude >= 0 ? 'E' : 'O';
    
    return `${Math.abs(latitude).toFixed(6)}°${latDir}, ${Math.abs(longitude).toFixed(6)}°${lonDir}`;
  }

  /**
   * Obtém informações de localização (endereço) usando coordenadas
   * Nota: Em produção, você pode integrar com APIs como Google Maps ou OpenStreetMap
   */
  async getLocationInfo(latitude: number, longitude: number): Promise<{
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  }> {
    // Implementação básica - em produção, usar API de geocoding
    try {
      // Exemplo de integração com API de geocoding
      // const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${API_KEY}`);
      // const data = await response.json();
      
      return {
        address: 'Endereço não disponível',
        city: 'Cidade não disponível',
        state: 'Estado não disponível',
        country: 'Brasil'
      };
    } catch (error) {
      return {
        address: 'Erro ao obter endereço',
        city: 'Erro ao obter cidade',
        state: 'Erro ao obter estado',
        country: 'Brasil'
      };
    }
  }

  /**
   * Cria um local permitido
   */
  createAllowedLocation(
    name: string,
    latitude: number,
    longitude: number,
    radius: number = 100
  ): Location {
    if (!this.isValidCoordinates(latitude, longitude)) {
      throw new Error('Coordenadas inválidas');
    }

    if (radius <= 0) {
      throw new Error('Raio deve ser maior que zero');
    }

    return {
      id: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      latitude,
      longitude,
      radius
    };
  }

  /**
   * Valida múltiplas localizações
   */
  async validateMultipleLocations(
    locations: Array<{ latitude: number; longitude: number }>,
    allowedLocations: Location[]
  ): Promise<Array<LocationValidation & { index: number }>> {
    const results = await Promise.all(
      locations.map(async (location, index) => {
        const validation = await this.validateLocation(
          location.latitude,
          location.longitude,
          allowedLocations
        );
        return { ...validation, index };
      })
    );

    return results;
  }
}
