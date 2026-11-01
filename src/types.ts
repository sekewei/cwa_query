export interface Env {
  CWA_API_KEY: string;
}

/** 7-Day Forecast Types (F-C0032-003) **/
export interface Cwa7DayResponse {
  cwaopendata: {
    Dataset: {
      DatasetInfo: {
        IssueTime: string;
        Update: string;
      };
      Locations: {
        Location: Cwa7DayLocation[];
      };
    };
  };
}

export interface Cwa7DayLocation {
  LocationName: string;
  WeatherElement: Cwa7DayElement[];
}

export interface Cwa7DayElement {
  ElementName: string;
  Time: Cwa7DayTime[];
}

export interface Cwa7DayTime {
  StartTime: string;
  EndTime: string;
  ElementValue: any;
}

export interface Forecast7Day {
  date: string;
  wx: string;
  maxT: number | null;
  minT: number | null;
}

export interface Dataset7Day {
  issuedAt: string;
  updatedAt: string;
  stale: boolean;
  index: Map<string, Forecast7Day[]>;
}

/** 36-Hour Forecast Types (F-C0032-001) **/
export interface Cwa36HourResponse {
  cwaopendata: {
    dataset: {
      datasetInfo: {
        issueTime: string;
        update: string;
      };
      location: Cwa36HourLocation[];
    };
  };
}

export interface Cwa36HourLocation {
  locationName: string;
  weatherElement: Cwa36HourElement[];
}

export interface Cwa36HourElement {
  elementName: string;
  time: Cwa36HourTime[];
}

export interface Cwa36HourTime {
  startTime: string;
  endTime: string;
  parameter: {
    parameterName: string;
    parameterValue?: string;
    parameterUnit?: string;
  };
}

export interface Forecast36Hour {
  startTime: string;
  endTime: string;
  weather: string;
  weatherCode: string;
  maxT: number | null;
  minT: number | null;
  comfort: string | null;
  pop: number | null;
}

export interface Dataset36Hour {
  issuedAt: string;
  updatedAt: string;
  stale: boolean;
  index: Map<string, Forecast36Hour[]>;
}
