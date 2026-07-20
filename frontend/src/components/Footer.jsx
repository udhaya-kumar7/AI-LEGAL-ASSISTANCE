import React from 'react';

const Footer = () => {
  return (
    <footer style={{padding:20,marginTop:24,textAlign:'center',color:'var(--muted)'}}>
      <div style={{display:'flex',justifyContent:'center',gap:12,alignItems:'center',flexDirection:'column'}}>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <a href="#" style={{color:'var(--muted)',textDecoration:'none'}}>Privacy</a>
          <span style={{color:'rgba(255,255,255,0.04)'}}>|</span>
          <a href="#" style={{color:'var(--muted)',textDecoration:'none'}}>Terms</a>
        </div>
        <div style={{fontSize:13,marginTop:6}}>© {new Date().getFullYear()} AI Legal Assistant — Built with ❤️ using React</div>
      </div>
    </footer>
  );
};

export default Footer;
