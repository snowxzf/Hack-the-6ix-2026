import React, { createContext, useContext, useState } from 'react';

const WeatherContext = createContext(null);

const CONDITIONS = ['sunny', 'partly_cloudy', 'rainy', 'cloudy', 'snowy', 'clear_night'];

const MOCK_WEATHER = {
    sunny: { temp: 26, label: 'Sunny', location: 'Toronto, ON' },
    partly_cloudy: { temp: 22, label: 'Partly cloudy', location: 'Toronto, ON' },
    rainy: { temp: 17, label: 'Light rain', location: 'Toronto, ON' },
    cloudy: { temp: 19, label: 'Overcast', location: 'Toronto, ON' },
    snowy: { temp: -3, label: 'Snowing', location: 'Toronto, ON' },
    clear_night: { temp: 14, label: 'Clear night', location: 'Toronto, ON' },
};

export function WeatherProvider({ children }) {
    const [condition, setCondition] = useState('partly_cloudy');
    const meta = MOCK_WEATHER[condition];
    const cycle = () => {
        const i = CONDITIONS.indexOf(condition);
        setCondition(CONDITIONS[(i + 1) % CONDITIONS.length]);
    };
    const value = { condition, setCondition, cycle, conditions: CONDITIONS, ...meta };
    return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}

export function useWeather() {
    const ctx = useContext(WeatherContext);
    if (!ctx) {
        return { condition: 'sunny', temp: 24, label: 'Sunny', location: 'Toronto', cycle: () => { }, conditions: CONDITIONS };
    }
    return ctx;
}