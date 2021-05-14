import logo from './logo.svg';
import './App.css';
import PizzaDoughCalc from './pizza/Pizza.js'



const App = () => {
  return (
    <div className="App">
      <div>
        {PizzaDoughCalc()}
      </div>
    </div>
  );
}

export default App;
