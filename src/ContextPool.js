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
    this.pending = {}; //adding inner contexts may happen before the actual inner context is ready, here we store the pending contexts
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
    let pendingKeys = Object.keys(this.pending);
    let ids = [...Array(this.props.initialSize + pendingKeys.length).keys()];
    for (let j = 0; j < pendingKeys.length; j++) {
      this.innerContexts[j] = this.pending[pendingKeys[j]];
      this.occupied[pendingKeys[j]] = j;
    }
    this.idCounter = this.props.initialSize + pendingKeys.length;
    this.free = [...ids];
    this.free.splice(0, pendingKeys.length);
    for (let id of this.free) {
      this.innerContexts[id] = React.createContext(null);
    }
    this.pending = {};
    this.ctx.addMultipleInnerContexts(ids, this.innerContexts);
  }
  checkFree() {
    if (this.free.length < this.props.minimumFree) {
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
    if (!this.ctx) {
      let retCtx = React.createContext(null);
      this.pending[contextId] = retCtx;
      return retCtx;
    }
    this.checkFree();
    let innerId = this.free.splice(0, 1)[0]; //remove first free
    this.occupied[contextId] = innerId;
    return this.innerContexts[innerId];
  }
  getInnerContext(contextId) {
    return this.innerContexts[this.occupied[contextId]];
  }
  removeInnerContext(contextId) {
    this.setInnerState(contextId, _ => null);
    let innerId = this.occupied[contextId];
    delete this.occupied[contextId];
    this.free.push(innerId);
  }
  setInnerState(contextId, stateF) {
    this.ctx.setInnerState(this.occupied[contextId], stateF);
  }
  getInnerState(contextId) {
    return this.ctx.getInnerState(this.occupied[contextId]);
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
