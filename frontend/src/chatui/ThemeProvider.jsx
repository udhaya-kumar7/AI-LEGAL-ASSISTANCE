import React, {useState, useEffect, createContext} from 'react';

export const ThemeContext = createContext({dark:true,toggle:()=>{}});

export default function ThemeProvider({children}){
  const [dark, setDark] = useState(true);
  useEffect(()=>{
    document.documentElement.dataset.theme = dark ? 'dark':'light';
    if(dark){
      document.documentElement.style.setProperty('--bg','#0b0d10');
      document.documentElement.style.setProperty('--panel','#0f1114');
      document.documentElement.style.setProperty('--text','#e6eef6');
    } else {
      document.documentElement.style.setProperty('--bg','#f7f7fa');
      document.documentElement.style.setProperty('--panel','#ffffff');
      document.documentElement.style.setProperty('--text','#0b1114');
    }
  },[dark]);

  return (
    <ThemeContext.Provider value={{dark, toggle:()=>setDark(d=>!d)}}>
      {children}
    </ThemeContext.Provider>
  )
}
