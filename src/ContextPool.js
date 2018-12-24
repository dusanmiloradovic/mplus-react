import React from "react";
import MultiContext from "react-multiple-contexts";

/*
every new child context forces a redraw, sometimes messing with the components. To avoid this, we will use the MultiContext with the pre-populated contexts, and never remove the created ones, just free them. We will use the internal mapping for the contexts. Real contexts will be created with numbers 1,2,3 .... serving as a counter, and the oids will be stored in a map
*/

export default class extends React.Component {
  constructor(props) {
    super(props);
    this.occupied = {};
    this.free = [];
    this.idCounter = 0;
    this.innerContexts = [];
    this.addInnerContext = this.addInnerContext.bind(this);
    this.getInnerContext = this.getInnerContext.bind(this);
    this.setInnerState = this.setInnerState.bind(this);
    this.getInnerState = this.getInnerState.bind(this);
    this.removeInnerContext = this.removeInnerContext.bind(this);
    this.addMultipleInnerContexts = this.addMultipleInnerContexts.bind(this);
    this.removeMultipleInnerContexts = this.removeMultipleInnerContexts.bind(
      this
    );
  }
  render() {
    let Provider = this.props.rootContext.Provider;
    return (
      <Provider value={this}>
        <MultiContext ref={ctx => (this.ctx = ctx)}>
          {this.props.children}
        </MultiContext>
      </Provider>
    );
  }

  componentDidMount() {
    //add initial number of contexts as defined in the properties
    let ids = [...Array(this.props.initialSize).keys()];
    this.idCounter = this.props.initialSize;
    this.free = ids;
    for (let id of ids) {
      this.innerContexts[id] = React.createContext(null);
    }
    this.ctx.addMultipleInnerContexts(ids, this.innerContexts);
  }
  checkFree() {
    if (this.free.count() < this.props.minimumFree) {
      let newIdCounter = this.idCounter + this.props.minimumFree;
      let newIds = [...Array(newIdCounter).keys()];
      newIds.splice(0, this.props.idCounter);
      let newContexts = [];
      for (let j of newIds) {
        let ctx = React.createContext(null);
        newContexts.push(ctx);
        this.innerContexts[j] = ctx;
      }
      this.idCounter = newIdCounter;
      this.free = this.free.concat(newIds);
      this.ctx.addMultipleInnerContexts(newIds, newContexts);
    }
  }
  addInnerContext(contextId) {
    this.checkFree();
    let innerId = this.free.splice(0, 1); //remove first free
    this.occupied.contextId = innerId;
    return this.innerContexts[innerId];
  }
  getInnerContext(contextId) {
    return this.innerContexts[this.occupied.contextId];
  }
  removeInnerContext(contextId) {
    let innerId = this.occupied.contextId;
    delete this.occupied.contextId;
    this.free.push(innerId);
  }
  setInnerState(contextId, stateF) {
    this.ctx.setInnerState(this.occupied.contextId, stateF);
  }
  getInnerState(contextId) {
    return this.ctx.getInnerState(this.occupied.contextId);
  }
  addMultipleInnerContexts(contextIds) {
    let rez = [];
    for (let j of contextIds) {
      //looping is enough, there will be no redraws
      rez.push(this.addInnerContext(j));
    }
    return rez;
  }
  removeMultipleInnerContexts(contextIds) {
    for (let j of contextIds) {
      this.removeInnerContext(j);
    }
  }

  get rootContext() {
    return this.props.rootContext;
  }
}
