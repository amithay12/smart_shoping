import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons'; // ספריית האייקונים שהתקנו

// המסכים שלנו
import ShoppingListScreen from '../screens/ShoppingListScreen';
import HouseholdScreen from '../screens/HouseholdScreen';
import HistoryScreen from '../screens/HistoryScreen';
import RecommendationsScreen from '../screens/RecommendationsScreen';
import StoreComparisonScreen from '../screens/StoreComparisonScreen';

// צבעי המותג שלנו
const COLORS = {
  primary: '#28a745', // Green
  gray: '#888',
};

// יוצרים את נתב הטאבים
const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      // הגדרות עיצוב לכל הטאבים
      screenOptions={({ route }) => ({
        headerShown: false, // אנחנו מסתירים את הכותרת (כבר יש לנו כותרת במסכים)
        tabBarActiveTintColor: COLORS.primary, // צבע לאייקון פעיל (ירוק)
        tabBarInactiveTintColor: COLORS.gray, // צבע לאייקון לא פעיל (אפור)
        tabBarStyle: {
          paddingBottom: 5, // ריפוד קטן בתחתית
          paddingTop: 5,
        },
        
        // פונקציה לבחירת אייקון לכל טאב
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'List') {
            iconName = focused ? 'list-circle' : 'list-circle-outline';
          } else if (route.name === 'Household') {
            iconName = focused ? 'people-circle' : 'people-circle-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Recommendations') {
            iconName = focused ? 'bulb' : 'bulb-outline';
          } else if (route.name === 'Compare') {
            iconName = focused ? 'storefront' : 'storefront-outline';
          }

          // החזרת רכיב האייקון
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      {/* הגדרת שלושת הטאבים שלנו */}
      <Tab.Screen 
        name="List" 
        component={ShoppingListScreen} 
        options={{ title: 'Shopping List' }} 
      />
      <Tab.Screen 
        name="Household" 
        component={HouseholdScreen} 
        options={{ title: 'My Household' }} 
      />
      <Tab.Screen 
        name="History" 
        component={HistoryScreen} 
        options={{ title: 'History' }} 
      />
      <Tab.Screen 
        name="Recommendations" 
        component={RecommendationsScreen} 
        options={{ title: 'Recommendations' }} 
      />
      <Tab.Screen 
        name="Compare" 
        component={StoreComparisonScreen} 
        options={{ title: 'Compare Prices' }} 
      />
    </Tab.Navigator>
  );
}