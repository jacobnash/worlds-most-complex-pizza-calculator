import React, { useEffect, useState } from 'react';
import 'react-dropdown/style.css';

const PizzaItems = () => {
    const [pizzaType] = useState([
        "Neapolitan",
        "NewYork",
        "Deep Dish",
    ]);

    const [defaultPizzaType, setPizzaType] = useState(pizzaType[0]); //because we like neo the most
    const yeastType = ["Biga", "Poolish", "Sour Dough", "Active Dry", "Instant"];
    const [defaultYeastType, setYeastType] = useState(yeastType[0]);
    const [servings, setServings] = useState(2);
    const [doughBall, setDoughBall] = useState(230); //grams 

    const changePizzaType = (e) => {
        console.log(e.target.value);
        setPizzaType(e.target.value);
    };

    const changeYeastType = (e) => {
        console.log(e.target.value);
        setYeastType(e.target.value);
    };

    const changeServings = (e) => {
        console.log(e.target.value);
        setServings(e.target.value);
        if (servings == 42) {
            alert("Some one is having a Party!");
        }
    }
    const getIngredients = () => {
        let list;

        return (
            <>
                <li> Flour: {.65 * doughBall * servings} grams </li>
                <li> Water: {.45 * doughBall * servings} grams </li>
                <li> Yeast: {.05 * doughBall * servings} grams </li>
            </>
        );
    }

    const getMethod = () => {

        return ("");
    }

    return (
        <div>
            <h2>Pizza Type</h2>
            <select onChange={e => changePizzaType(e)}>
                {pizzaType.map(item => (
                    <option
                        key={item}
                        value={item}
                    >
                        {item}
                    </option>
                ))}
            </select>
            <h2>Yeast Type</h2>
            <select onChange={e => changeYeastType(e)}>
                {yeastType.map(item => (
                    <option
                        key={item}
                        value={item}
                    >
                        {item}
                    </option>
                ))}
            </select>
            <h2>Servings</h2>
            <input onChange={e => changeServings(e)}
                placeholder={servings}
                type="number"
            />
            <h2>
                Pizza Dough Ball Size
            </h2>
            <input onChange={e => { setDoughBall(e.target.value) }}
                placeholder={doughBall}
                type="number"
            />
            <h3>Recipe: </h3>
            <ul>
                {getIngredients()}
            </ul>
            <h3>Method: </h3>
            <p>
                {getMethod()}
            </p>
        </div>


    );

}

const PizzaDoughCalc = () => {
    useEffect(() => {
        document.title = "Tonight We're having pizza!"
    }, [])
    return (
        <div>
            <h1>Pizza Dough Calculator</h1>
            <div>{PizzaItems()}</div>
        </div>
    );
}

export default PizzaDoughCalc;